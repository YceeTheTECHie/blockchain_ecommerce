import express, { Request, Response } from "express";
import { UnitUser, User } from "./user.interface";
import { StatusCodes } from "http-status-codes";
import Irys from "@irys/sdk";
import fs from "fs";
import Arweave from "@irys/arweave";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { checkAuthToken, generateJwtToken } from "../helper";
import { v4 as uuidv4 } from "uuid";
import { random } from "lodash";
const prisma = new PrismaClient();

export const userRouter = express.Router();

userRouter.get("/user", async (req: Request, res: Response) => {
  try {
    // check token
    const validateToken = await checkAuthToken(req);
    if (!validateToken.is_valid) { 
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "Token is expired or invalid"
      });
    }
    const userId = validateToken.user_id;
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });
    if (!user) {
      return res
        .status(StatusCodes.OK)
        .json({ message: "user does not exist" });
    }
    // retrieve password from irys
    let profile = await getDataFromIrys(user.profile_id);
    if (!profile) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Unable to fetch user data from the blockchain",
      });
    }
    const shippingInfo = await prisma.order.findFirst({
      where: {
        user_id: userId,
      },
    });
    let shippingInfoDetails: any;
    if (shippingInfo) {
      shippingInfoDetails = await getDataFromIrys(
        shippingInfo.shipping_info_id
      );
    }
    return res.status(StatusCodes.OK).json({
      message: "User profile fetched successfully!",
      data: {
        user_id: userId,
        profile_id: user.profile_id,
        shipping_info: shippingInfo ? shippingInfoDetails : undefined,
      },
    });
  } catch (error: any) {
    console.log(error)
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: Object.keys(error).length < 1 ? "an error occurred" : error,
    });
  }
});

export async function uploadDataToIrys(userData: object): Promise<any> {
  const jwk = JSON.parse(fs.readFileSync("wallet.json").toString()) as any;
  const url = "https://node2.irys.xyz";
  const token = "arweave";
  const irys = new Irys({
    url, // URL of the node you want to connect to
    token, // Token used for payment and signing
    key: jwk as string,
  });
  const receipt = await irys.upload(JSON.stringify(userData));
  return receipt.id;
}

async function getDataFromIrys(txId: string): Promise<any> {
  const jwk = JSON.parse(fs.readFileSync("wallet.json").toString()) as any;
  const url = "https://node2.irys.xyz";
  const token = "arweave";

  const irys = new Irys({
    url, // URL of the node you want to connect to
    token, // Token used for payment and signing
    key: jwk as string,
  });
  const arweave = new Arweave({ url: "https://arweave.net" });
  try {
    // const receipt = await arweave.transactions.getData(txId);
    // return receipt.toString();
    const receipt = await irys.api.get(txId);
    return receipt.data;
    // console.log(receipt.toString(), "data incoming");
    //   console.log(`Data uploaded ==> https://arweave.net/${receipt.id}`);
  } catch (e) {
    console.log("Error uploading data ", e);
  }
}

async function generateHash(data: string): Promise<string> {
  const saltRounds = 10;
  try {
    const hash = await bcrypt.hash(data, saltRounds);
    return hash;
  } catch (error) {
    throw new Error("An error occured while hashing password");
  }
}
userRouter.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: `Please provide all the required parameters..` });
    }
    const emails = await prisma.user.findMany();
    let emailExists: boolean = false;
    for (let i = 0; i < emails.length; i++) {
      emailExists = await bcrypt.compare(email, emails[i].email_id);
      if (emailExists) {
        emailExists = true;
        break;
      }
    }
    if (emailExists) {
      return res
        .status(StatusCodes.OK)
        .json({ message: "user email already exists" });
    }
    // create record
    const hashedEmail = await generateHash(email);
    const profileId = await uploadDataToIrys({
      email,
      password: await generateHash(password),
    });
    const userId = random(1, 10000)
    await prisma.user.create({
      data: {
        id: userId,
        email_id: hashedEmail,
        profile_id: profileId,
      },
    });
    const jwtToken = await generateJwtToken(
      {
        user_id: userId ,
      },
      "process.env.JWT_SECRET"
    );
    return res.status(StatusCodes.CREATED).json({
      message: "User created successfully!",
      data: { email, token: jwtToken },
    });
  } catch (error: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: Object.keys(error).length < 1 ? "an error occurred" : error,
    });
  }
});

userRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Please provide all the required parameters.." });
    }
    const emails = await prisma.user.findMany();
    let user: any = null;
    console.log(emails);
    for (let i = 0; i < emails.length; i++) {
      let emailExists = await bcrypt.compare(email, emails[i].email_id);
      if (emailExists) {
        user = emails[i];
        break;
      }
    }
    if (!user) {
      return res
        .status(StatusCodes.OK)
        .json({ message: "user does not exist" });
    }
    // retrieve password from irys
    let profile = await getDataFromIrys(user.profile_id);
    if (!profile) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Unable to fetch user data from the blockchain",
      });
    }
    const isPasswordValid = await bcrypt.compare(password, profile.password);
    if (!isPasswordValid) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Invalid login details",
      });
    }
    const jwtToken = await generateJwtToken(
      {
        user_id: user.id,
      },
      "process.env.JWT_SECRET"
    );
    const shippingInfo = await prisma.order.findFirst({
      where: {
        user_id: user.id,
      },
    });
    let shippingInfoDetails: any;
    if (shippingInfo) {
      shippingInfoDetails = await getDataFromIrys(
        shippingInfo.shipping_info_id
      );
    }
    return res.status(StatusCodes.OK).json({
      message: "User logged in successfully!",
      data: {
        email,
        shipping_info: shippingInfo ? shippingInfoDetails : undefined,
        token: jwtToken,
      }, 
    });
  } catch (error: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: Object.keys(error).length < 1 ? "an error occurred" : error,
    });
  }
});
