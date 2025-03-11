import { Router, Response, Request, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';

const router = Router();

interface AddSongBody {
  playlistId: string;
  song: {
    videoId: string;
    title: string;
    artist: string;
    thumbnail: string;
  };
}

// Add song to playlist
const addSongToPlaylist = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    console.log('=== POST /mobile/playlists/add-song ===');
    console.log('User:', user);
    console.log('Request body:', req.body);

    const { playlistId, song } = req.body as AddSongBody;

    if (!playlistId || !song?.videoId || !song?.title || !song?.artist || !song?.thumbnail) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Verify playlist ownership
    const playlist = await prisma.playlist.findFirst({
      where: {
        id: playlistId,
        userId: user!.id
      }
    });

    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found or unauthorized' });
      return;
    }

    // Add song to playlist using a transaction
    const result = await prisma.$transaction(async (tx: Omit<PrismaClient, '$transaction'>) => {
      // Create or update the song
      const upsertedSong = await tx.song.upsert({
        where: { videoId: song.videoId },
        update: {
          title: song.title,
          artist: song.artist,
          thumbnail: song.thumbnail
        },
        create: {
          videoId: song.videoId,
          title: song.title,
          artist: song.artist,
          thumbnail: song.thumbnail
        }
      });

      // Create the playlist-song connection if it doesn't exist
      try {
        await tx.playlistSong.create({
          data: {
            playlistId: playlist.id,
            songId: upsertedSong.videoId
          }
        });
      } catch (error: any) {
        // If the song is already in the playlist, ignore the unique constraint error
        if (error.code !== 'P2002') {
          throw error;
        }
        console.log('Song already exists in playlist');
      }

      return upsertedSong;
    });

    res.json({
      success: true,
      message: 'Song added to playlist',
      song: result
    });

  } catch (error) {
    next(error);
  }
};

// Remove song from playlist
const removeSongFromPlaylist = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { playlistId, songId } = req.params;

    // Verify playlist ownership
    const playlist = await prisma.playlist.findFirst({
      where: {
        id: playlistId,
        userId: user!.id
      }
    });

    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found or unauthorized' });
      return;
    }

    // Remove song from playlist
    await prisma.playlistSong.delete({
      where: {
        playlistId_songId: {
          playlistId: playlist.id,
          songId: songId
        }
      }
    });

    res.json({
      success: true,
      message: 'Song removed from playlist'
    });

  } catch (error) {
    next(error);
  }
};

// Apply middleware and routes
router.use(authenticateToken);
router.post('/add-song', addSongToPlaylist);
router.delete('/:playlistId/songs/:songId', removeSongFromPlaylist);

export default router;
