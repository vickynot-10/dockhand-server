import type { Request, Response } from "express";

export const send_success = (
  res: Response,
  status = 200,
  data?: null | any,
  msg?: string,
) => {
  return res.status(status).json({
    success: true,
    data: data,
    msg,
  });
};

export const send_error = (res: Response, status = 400, msg?: string) => {
  return res.status(status).json({
    success: false,
    data: null,
    msg,
  });
};
