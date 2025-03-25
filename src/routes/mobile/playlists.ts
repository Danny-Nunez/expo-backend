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

// Like a song
const likeSong = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { songId } = req.params;
    const { title, artist, thumbnail } = req.body;  // Get song data from request body

    console.log('Liking song with data:', { songId, title, artist, thumbnail });

    // Create or update song with provided details
    await prisma.song.upsert({
      where: { videoId: songId },
      update: {  // Update with provided data
        title: title || songId,
        artist: artist || 'Unknown Artist',
        thumbnail: thumbnail || ''
      },
      create: {  // Create with provided data
        videoId: songId,
        title: title || songId,
        artist: artist || 'Unknown Artist',
        thumbnail: thumbnail || ''
      }
    });

    // Create like
    try {
      await prisma.like.create({
        data: {
          userId: user!.id,
          songId: songId
        }
      });
    } catch (error: any) {
      // If like already exists, ignore the unique constraint error
      if (error.code !== 'P2002') {
        throw error;
      }
      console.log('Song already liked by user');
    }

    res.json({
      success: true,
      message: 'Song liked successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Unlike a song
const unlikeSong = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { songId } = req.params;

    // Delete like if it exists
    await prisma.like.deleteMany({
      where: {
        userId: user!.id,
        songId: songId
      }
    });

    res.json({
      success: true,
      message: 'Song unliked successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Get all liked songs for a user
const getLikedSongs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;

    const likedSongs = await prisma.like.findMany({
      where: {
        userId: user!.id
      },
      include: {
        song: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      songs: likedSongs.map(like => ({
        videoId: like.song.videoId,
        title: like.song.title,
        artist: like.song.artist,
        thumbnail: like.song.thumbnail,
        likedAt: like.createdAt
      }))
    });

  } catch (error) {
    next(error);
  }
};

// Check if user has liked a song
const checkSongLike = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { songId } = req.params;

    const like = await prisma.like.findFirst({
      where: {
        userId: user!.id,
        songId: songId
      }
    });

    res.json({
      success: true,
      isLiked: !!like
    });

  } catch (error) {
    next(error);
  }
};

// Get shared playlist details
const getSharedPlaylist = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { playlistId } = req.params;

    // First check if the playlist was shared with the user through a message
    const message = await prisma.message.findFirst({
      where: {
        toId: user!.id,
        playlistId: playlistId
      }
    });

    // If no message found sharing this playlist with the user, check if they own it
    const playlist = await prisma.playlist.findFirst({
      where: {
        id: playlistId,
        OR: [
          { userId: user!.id }, // User owns the playlist
          { id: message?.playlistId } // Playlist was shared with user
        ]
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        songs: {
          include: {
            song: true
          }
        }
      }
    });

    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found or unauthorized' });
      return;
    }

    res.json({
      success: true,
      playlist: {
        id: playlist.id,
        name: playlist.name,
        userId: playlist.userId,
        userName: playlist.user.name || '',
        userImage: playlist.user.image,
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
        songs: playlist.songs.map(ps => ({
          videoId: ps.song.videoId,
          title: ps.song.title,
          artist: ps.song.artist,
          thumbnail: ps.song.thumbnail
        }))
      }
    });

  } catch (error) {
    next(error);
  }
};

// Get all playlists shared with user
const getSharedPlaylists = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;

    // Get all messages with shared playlists sent to the user
    const messages = await prisma.message.findMany({
      where: {
        toId: user!.id,
        NOT: { playlistId: null }
      },
      include: {
        from: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        playlist: {
          include: {
            songs: {
              include: {
                song: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      sharedPlaylists: messages.map((message: {
        id: string;
        content: string;
        createdAt: Date;
        from: {
          id: string;
          name: string | null;
          image: string | null;
        };
        playlist: {
          id: string;
          name: string;
          songs: Array<{
            song: {
              videoId: string;
              title: string;
              artist: string;
              thumbnail: string;
            };
          }>;
        } | null;
      }) => ({
        messageId: message.id,
        messageContent: message.content,
        sharedAt: message.createdAt,
        sharedBy: {
          id: message.from.id,
          name: message.from.name,
          image: message.from.image
        },
        playlist: message.playlist ? {
          id: message.playlist.id,
          name: message.playlist.name,
          songCount: message.playlist.songs.length,
          songs: message.playlist.songs.map((ps: {
            song: {
              videoId: string;
              title: string;
              artist: string;
              thumbnail: string;
            };
          }) => ({
            videoId: ps.song.videoId,
            title: ps.song.title,
            artist: ps.song.artist,
            thumbnail: ps.song.thumbnail
          }))
        } : null
      }))
    });

  } catch (error) {
    next(error);
  }
};

// Apply middleware
router.use(authenticateToken);

// Playlist routes
router.post('/', createPlaylist);
router.get('/:playlistId', getSharedPlaylist);
router.patch('/:playlistId', updatePlaylist);
router.delete('/:playlistId', deletePlaylist);
router.post('/add-song', addSongToPlaylist);
router.delete('/:playlistId/songs/:songId', removeSongFromPlaylist);
router.get('/:playlistId/songs/:songId/exists', checkSongInPlaylist);
router.get('/shared', getSharedPlaylists);

// Like routes
router.post('/songs/:songId/like', likeSong);
router.delete('/songs/:songId/like', unlikeSong);
router.get('/songs/:songId/like', checkSongLike);
router.get('/liked-songs', getLikedSongs);

export default router;
