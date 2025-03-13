import { Router, Response, Request, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';

const router = Router();

interface CreatePlaylistBody {
  name: string;
}

interface UpdatePlaylistBody {
  name: string;
}

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
    const result = await prisma.$transaction(async (tx) => {
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

// Create a new playlist
const createPlaylist = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { name } = req.body as CreatePlaylistBody;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Valid playlist name is required' });
      return;
    }

    const newPlaylist = await prisma.playlist.create({
      data: {
        name: name.trim(),
        userId: user!.id,
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    res.json({
      success: true,
      playlist: {
        id: newPlaylist.id,
        name: newPlaylist.name,
        userId: newPlaylist.userId,
        createdAt: newPlaylist.createdAt,
        updatedAt: newPlaylist.updatedAt,
        userName: newPlaylist.user?.name || '',
        songs: [],
      }
    });

  } catch (error) {
    next(error);
  }
};

// Update playlist name
const updatePlaylist = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { playlistId } = req.params;
    const { name } = req.body as UpdatePlaylistBody;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Valid playlist name is required' });
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

    // Update playlist name
    const updatedPlaylist = await prisma.playlist.update({
      where: {
        id: playlistId,
      },
      data: {
        name: name.trim(),
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    res.json({
      success: true,
      playlist: {
        id: updatedPlaylist.id,
        name: updatedPlaylist.name,
        userId: updatedPlaylist.userId,
        createdAt: updatedPlaylist.createdAt,
        updatedAt: updatedPlaylist.updatedAt,
        userName: updatedPlaylist.user?.name || '',
      }
    });

  } catch (error) {
    next(error);
  }
};

// Check if song exists in playlist
const checkSongInPlaylist = async (
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

    // Check if song exists in playlist
    const playlistSong = await prisma.playlistSong.findUnique({
      where: {
        playlistId_songId: {
          playlistId: playlist.id,
          songId: songId
        }
      }
    });

    res.json({
      success: true,
      exists: !!playlistSong
    });

  } catch (error) {
    next(error);
  }
};

// Delete playlist
const deletePlaylist = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { playlistId } = req.params;

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

    // Delete playlist
    await prisma.playlist.delete({
      where: {
        id: playlistId,
      },
    });

    res.json({
      success: true,
      message: 'Playlist deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Apply middleware and routes
router.use(authenticateToken);
router.post('/', createPlaylist);
router.patch('/:playlistId', updatePlaylist);
router.delete('/:playlistId', deletePlaylist);
router.post('/add-song', addSongToPlaylist);
router.delete('/:playlistId/songs/:songId', removeSongFromPlaylist);
router.get('/:playlistId/songs/:songId/exists', checkSongInPlaylist);

export default router;
