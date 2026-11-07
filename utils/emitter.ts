import { Emitter } from "@socket.io/redis-emitter";
import { redisConnection } from "../config/redis.js";

export const emitter = new Emitter(redisConnection.duplicate());
