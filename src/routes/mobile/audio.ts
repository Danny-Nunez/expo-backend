import { Router, Response, Request, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
const ACRCloud = require('acrcloud');

const router = Router();

// Initialize ACRCloud client
const acrcloud = new ACRCloud({
  host: process.env.ACRCLOUD_HOST || 'identify-eu-west-1.acrcloud.com',
  accessKey: process.env.ACRCLOUD_ACCESS_KEY || '',
  accessSecret: process.env.ACRCLOUD_ACCESS_SECRET || '',
  timeout: 10 // seconds
});

interface AudioFingerprintBody {
  audioData: string; // Base64 encoded audio data
  audioFormat?: string; // 'wav', 'mp3', 'm4a', etc.
}

// Identify song from audio fingerprint
const identifySong = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { audioData, audioFormat = 'wav' } = req.body as AudioFingerprintBody;

    if (!audioData) {
      res.status(400).json({ error: 'Audio data is required' });
      return;
    }

    console.log('=== POST /mobile/audio/identify ===');
    console.log('User:', user?.id);
    console.log('Audio format:', audioFormat);

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');

    // Prepare parameters for ACRCloud
    const params = {
      sample_hz: 8000,
      data: audioBuffer,
      data_type: 'audio',
      format: audioFormat
    };

    // Call ACRCloud API
    const result = await acrcloud.identify(params);
    console.log('ACRCloud result:', result);

    // Parse the result
    const parsedResult = JSON.parse(result);
    
    if (parsedResult.status && parsedResult.status.code === 0) {
      // Success - song identified
      const music = parsedResult.metadata?.music?.[0];
      
      if (music) {
        const songInfo = {
          title: music.title,
          artist: music.artists?.[0]?.name,
          album: music.album?.name,
          releaseDate: music.release_date,
          genres: music.genres?.map((g: any) => g.name),
          externalIds: music.external_ids,
          externalMetadata: music.external_metadata,
          playOffsetMs: music.play_offset_ms,
          durationMs: music.duration_ms
        };

        // Save the identified song to database if it doesn't exist
        let song = await prisma.song.findUnique({
          where: { videoId: songInfo.externalIds?.youtube || songInfo.title }
        });

        if (!song) {
          // Create a placeholder videoId if no YouTube ID
          const videoId = songInfo.externalIds?.youtube || `fingerprint_${Date.now()}`;
          
          song = await prisma.song.create({
            data: {
              videoId: videoId,
              title: songInfo.title,
              artist: songInfo.artist || 'Unknown Artist',
              thumbnail: songInfo.externalMetadata?.youtube?.thumbnails?.[0]?.url || ''
            }
          });
        }

        res.json({
          success: true,
          song: {
            ...songInfo,
            videoId: song.videoId,
            thumbnail: song.thumbnail
          },
          confidence: parsedResult.status.msg
        });
      } else {
        res.json({
          success: false,
          message: 'No music detected in the audio sample',
          confidence: parsedResult.status.msg
        });
      }
    } else {
      // Error or no match found
      res.json({
        success: false,
        message: parsedResult.status?.msg || 'Failed to identify song',
        error: parsedResult.status
      });
    }

  } catch (error) {
    console.error('Error identifying song:', error);
    next(error);
  }
};

// Get audio fingerprinting status/health
const getAudioStatus = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check if ACRCloud credentials are configured
    const isConfigured = !!(process.env.ACRCLOUD_ACCESS_KEY && process.env.ACRCLOUD_ACCESS_SECRET);

    res.json({
      success: true,
      audioFingerprinting: {
        enabled: isConfigured,
        provider: 'ACRCloud',
        host: process.env.ACRCLOUD_HOST || 'identify-eu-west-1.acrcloud.com'
      }
    });

  } catch (error) {
    next(error);
  }
};

// Apply middleware
router.use(authenticateToken);

// Audio routes
router.post('/identify', identifySong);
router.get('/status', getAudioStatus);

export default router; 