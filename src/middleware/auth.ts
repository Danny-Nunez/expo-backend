import { Request, Response, NextFunction, RequestHandler } from 'express';
import { prisma } from '../lib/prisma';

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export const authenticateToken: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sessionToken = req.headers['x-session-token'] as string;

    if (!sessionToken) {
      res.status(401).json({ error: 'No session token provided' });
      return;
    }

    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
          },
        },
      },
    });

    if (!session) {
      res.status(401).json({ error: 'Invalid session token' });
      return;
    }

    if (new Date() > session.expires) {
      await prisma.session.delete({
        where: { id: session.id },
      });
      res.status(401).json({ error: 'Session has expired' });
      return;
    }

    (req as AuthenticatedRequest).user = session.user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
