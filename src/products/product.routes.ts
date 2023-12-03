import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { PrismaClient } from "@prisma/client";
import { random, uniqueId } from "lodash";
import { uploadDataToIrys } from "../users/users.routes";
import { checkAuthToken } from "../helper";
const prisma = new PrismaClient();

export const productRouter = express.Router();

productRouter.get("/products", async (req: Request, res: Response) => {
  try {
    const allProducts = await prisma.product.findMany();
    if (allProducts.length < 0) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: `No products found!` });
    }
    return res.status(StatusCodes.OK).json({
      message: "Products fetch successfully",
      total: allProducts.length,
      data: allProducts,
    });
  } catch (error: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: Object.keys(error).length < 1 ? "an error occurred" : error,
    });
  }
});

productRouter.get("/product/:id", async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findUnique({
      where: {
        id: parseInt(req.params.id),
      },
    });
    if (!product) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Product does not exist" });
    }

    return res.status(StatusCodes.OK).json({
      message: "product fetched successfully",
      data: product,
    });
  } catch (error: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: Object.keys(error).length < 1 ? "an error occurred" : error,
    });
  }
});

productRouter.post("/product/:id/buy", async (req: Request, res: Response) => {
    try {
      // check token
      const validateToken = await checkAuthToken(req);
      if (!validateToken.is_valid) {
        return res.status(StatusCodes.FORBIDDEN).json({
          message: "Token is expired or invalid",
        });
      }
      const userId = validateToken.user_id;
      const {
        first_name,
        last_name,
        address,
        city,
        address2,
        country,
        postcode,
        phone_number,
        quantity,
        transaction_id,
      } = req.body;

      if (
        !first_name ||
        !last_name ||
        !address ||
        !phone_number ||
        !transaction_id
      ) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: `Name, address, transaction_id and phone number are required.`,
        });
      }
      const productId = parseInt(req.params.id);
      const product = await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });
      if (!product) {
        return res
          .status(StatusCodes.BAD_REQUEST)
          .json({ error: `Product does not exist.` });
      }
      let shippingInfo = await prisma.order.findFirst({
        where: {
          user_id: userId,
        },
      });
      let shippingInfoId = shippingInfo?.shipping_info_id as string;
        if (!shippingInfoId) {
        shippingInfoId = await uploadDataToIrys({
          ...req.body,
          transaction_id: undefined,
          quantity: undefined,
        });
      }
      const order = await prisma.order.create({
        data: {
          id: random(1, 230000),
          shipping_info_id: shippingInfoId,
          user_id: userId,
          cost: product.price * parseInt(quantity ?? 1),
          currency_symbol: product.currency_symbol,
          product_id: productId,
          quantity: quantity ?? 1,
          payment_status: "pending",
          delivery_status: "not_delivered",
          transaction_id,
        },
      });
      return res.status(StatusCodes.CREATED).json({
        message: "Order placed successfully",
        data: order,
      });
    } catch (error: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: Object.keys(error).length < 1 ? "an error occurred" : error,
    });
  }
});
