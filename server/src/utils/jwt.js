import { generateToken, verifyToken } from '../config/jwt.js';

export const createAccessToken = (user) => {
  return generateToken({
    userId: user.id,
    email: user.email
  });
};

export const verifyAccessToken = (token) => {
  return verifyToken(token);
};

export const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
};