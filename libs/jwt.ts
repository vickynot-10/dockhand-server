import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET_KEY as string;

if (!JWT_SECRET) {
  throw new Error("JWT SECRET  is not defined");
}

type JwtPayload = {
  id: string;
  name: string;
  email: string;
};

export function generateToken(payload: JwtPayload) {
  try {
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: "7d",
    });

    return token;
  } catch (err) {
    console.error("Error generating token:", err);
    throw err;
  }
}

export function decryptToken(token: string) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (err) {
    console.error("Invalid token:", err);
    return null;
  }
}
