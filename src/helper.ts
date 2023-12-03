import { PrismaClient } from "@prisma/client";

require("dotenv").config();
const jwt = require("jsonwebtoken");
const prisma = new PrismaClient();

export async function generateJwtToken(
  claim: object,
  secret: string,
  expTimeInSeconds = 300000
): Promise<string> {
  const saltRounds = 10;
  const token = jwt.sign(claim, secret, { expiresIn: expTimeInSeconds });
  return token;
}

export async function checkAuthToken(req: any) {
  try {
    // extracting the token
    const token = req.headers.authorization.split(" ")[1];
    const decodedToken = jwt.verify(token, "process.env.JWT_SECRET", {
      expiresIn: 300000,
    });
    req.token = token;
    req.userData = decodedToken;
    const userDetails = await prisma.user.findUnique({
      where: {
        id: parseInt(decodedToken.user_id),
      },
    });
    if (!userDetails) {
      return {
        is_valid: false,
        user_id: null,
      };
    }
    return {
      is_valid: true,
      user_id: decodedToken.user_id,
    };
  } catch (error) {
    return {
      is_valid: false,
      user_id: null,
    };
  }
}
