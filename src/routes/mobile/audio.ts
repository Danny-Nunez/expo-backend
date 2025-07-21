import { Router, Response, Request, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
const ACRCloud = require('acrcloud');

const router = Router();

// Validate ACRCloud credentials at startup
const acrcloudAccessKey = process.env.ACRCLOUD_ACCESS_KEY;
const acrcloudSecretKey = process.env.ACRCLOUD_SECRET_KEY;
const acrcloudHost = process.env.ACRCLOUD_HOST || 'identify-us-west-2.acrcloud.com';

console.log('🔍 ACRCloud Environment Check:');
console.log('Host:', acrcloudHost);
console.log('Access Key:', acrcloudAccessKey ? 'SET' : 'MISSING');
console.log('Secret Key:', acrcloudSecretKey ? 'SET' : 'MISSING');

if (!acrcloudAccessKey || !acrcloudSecretKey) {
  console.error('❌ ACRCloud credentials are missing! Cannot initialize ACRCloud client.');
  throw new Error('ACRCloud credentials not configured. Please check your environment variables.');
}

// Initialize ACRCloud client
console.log('🔧 Creating ACRCloud client with:');
console.log('  - host:', acrcloudHost);
console.log('  - accessKey:', acrcloudAccessKey ? `${acrcloudAccessKey.substring(0, 8)}...` : 'undefined');
console.log('  - accessSecret:', acrcloudSecretKey ? `${acrcloudSecretKey.substring(0, 8)}...` : 'undefined');

// Create config object
const acrcloudConfig = {
  host: acrcloudHost,
  access_key: acrcloudAccessKey,
  access_secret: acrcloudSecretKey,
  timeout: 10 // seconds
};

console.log('🔧 ACRCloud config object:', {
  host: acrcloudConfig.host,
  access_key: acrcloudConfig.access_key ? 'SET' : 'MISSING',
  access_secret: acrcloudConfig.access_secret ? 'SET' : 'MISSING',
  timeout: acrcloudConfig.timeout
});

const acrcloud = new ACRCloud(acrcloudConfig);

console.log('✅ ACRCloud client initialized successfully');

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

    console.log('=== POST /mobile/audio/identify ===');
    console.log('User:', user?.id);
    console.log('Audio format:', audioFormat);
    console.log('Audio data length:', audioData?.length || 0);
    console.log('Request body keys:', Object.keys(req.body));

    if (!audioData) {
      console.log('❌ Error: Audio data is missing');
      res.status(400).json({ error: 'Audio data is required' });
      return;
    }

    console.log('✅ Audio data received, processing...');

    // Convert base64 to buffer
    console.log('🔄 Converting base64 to buffer...');
    const audioBuffer = Buffer.from(audioData, 'base64');
    console.log('✅ Buffer created, size:', audioBuffer.length, 'bytes');

    // Call ACRCloud API
    console.log('🔄 Calling ACRCloud API...');
    console.log('ACRCloud config:', {
      host: acrcloudHost,
      accessKey: acrcloudAccessKey ? '***' : 'MISSING',
      accessSecret: acrcloudSecretKey ? '***' : 'MISSING'
    });
    console.log('Audio buffer size:', audioBuffer.length, 'bytes');
    console.log('Audio format:', audioFormat);
    
    const result = await acrcloud.identify(audioBuffer);
    console.log('✅ ACRCloud API call completed');
    console.log('ACRCloud result type:', typeof result);
    console.log('ACRCloud result keys:', Object.keys(result || {}));

    // The result is already a JavaScript object, no need to parse
    const parsedResult = result;
    console.log('✅ Result processed successfully');
    console.log('Parsed result status:', parsedResult?.status);
    
    if (parsedResult.status && parsedResult.status.code === 0) {
      console.log('✅ ACRCloud returned success status');
      // Success - song identified
      const music = parsedResult.metadata?.music?.[0];
      console.log('Music metadata found:', !!music);
      
      if (music) {
        console.log('🔄 Extracting song information...');
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
        console.log('✅ Song info extracted:', {
          title: songInfo.title,
          artist: songInfo.artist,
          album: songInfo.album,
          hasExternalIds: !!songInfo.externalIds,
          hasExternalMetadata: !!songInfo.externalMetadata
        });

        // Save the identified song to database if it doesn't exist
        console.log('🔄 Checking if song exists in database...');
        const searchVideoId = songInfo.externalIds?.youtube || songInfo.title;
        console.log('Searching with videoId:', searchVideoId);
        
        let song = await prisma.song.findUnique({
          where: { videoId: searchVideoId }
        });

        if (!song) {
          console.log('🔄 Song not found, creating new entry...');
          // Create a placeholder videoId if no YouTube ID
          const videoId = songInfo.externalIds?.youtube || `fingerprint_${Date.now()}`;
          console.log('Creating song with videoId:', videoId);
          
          song = await prisma.song.create({
            data: {
              videoId: videoId,
              title: songInfo.title,
              artist: songInfo.artist || 'Unknown Artist',
              thumbnail: songInfo.externalMetadata?.youtube?.thumbnails?.[0]?.url || ''
            }
          });
          console.log('✅ New song created in database');
        } else {
          console.log('✅ Song already exists in database');
        }

        console.log('✅ Sending success response to client');
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
        console.log('❌ No music metadata found in ACRCloud response');
        res.json({
          success: false,
          message: 'No music detected in the audio sample',
          confidence: parsedResult.status.msg
        });
      }
    } else {
      // Error or no match found
      console.log('❌ ACRCloud returned error status:', parsedResult.status);
      res.json({
        success: false,
        message: parsedResult.status?.msg || 'Failed to identify song',
        error: parsedResult.status
      });
    }

  } catch (error) {
    console.error('❌ Unexpected error in identifySong:', error);
    console.error('Error stack:', error.stack);
    console.error('Error message:', error.message);
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
    const isConfigured = !!(process.env.ACRCLOUD_ACCESS_KEY && process.env.ACRCLOUD_SECRET_KEY);

    res.json({
      success: true,
      audioFingerprinting: {
        enabled: isConfigured,
        provider: 'ACRCloud',
        host: process.env.ACRCLOUD_HOST || 'identify-us-west-2.acrcloud.com'
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