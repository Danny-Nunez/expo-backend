import express from 'express';
import cors from 'cors';
import playlistRoutes from './routes/mobile/playlists';
import userRoutes from './routes/mobile/users';
import { prisma } from './lib/prisma';

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/mobile/playlists', playlistRoutes);
app.use('/mobile/users', userRoutes);

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Health check endpoint
app.get('/health', (_req: express.Request, res: express.Response) => {
  res.json({ status: 'ok' });
});

const start = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('Connected to database');

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

start().catch(console.error);
