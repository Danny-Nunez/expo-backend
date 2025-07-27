import { Router, Response, NextFunction } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';

interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const router = Router();

// Upload image
const uploadImage = async (
  req: AuthenticatedRequest,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const { assets } = req.body;

    if (!assets?.[0]?.uri) {
      res.status(400).json({
        success: false,
        error: 'No image URI provided'
      });
      return;
    }

    const imageData = assets[0];
    console.log('Processing image:', imageData);

    // Upload to Cloudinary
    const uploadResult = await new Promise<CloudinaryUploadResult>((resolve, reject) => {
      cloudinary.uploader.upload(
        imageData.uri,
        {
          folder: 'profile-images',
          resource_type: 'image',
          allowed_formats: ['jpg', 'jpeg'],
          transformation: [
            { width: 500, height: 500, crop: 'fill' },
            { quality: 80 }
          ]
        },
        (error: any, result: any) => {
          if (error || !result) {
            console.error('Cloudinary upload error:', error);
            reject(error || new Error('Upload failed'));
          } else {
            console.log('Cloudinary upload successful');
            resolve(result);
          }
        }
      );
    });

    // After the Cloudinary upload, add this logging:
    console.log('Cloudinary upload successful:', uploadResult.secure_url);

    // Before the database update:
    console.log('About to update database for user:', req.user!.id);

    // Update the user's image field in the database
    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: { image: uploadResult.secure_url }
    });

    // After the database update:
    console.log('Database update completed:', {
      userId: updatedUser.id,
      oldImage: req.user!.image,
      newImage: updatedUser.image,
      isGoogleUser: updatedUser.email?.includes('gmail.com')
    });

    // Verify the update by fetching the user again:
    const verifyUser = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, image: true, email: true }
    });

    console.log('Verification - User data after update:', verifyUser);

    res.json({
      success: true,
      data: {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id
      }
    });

  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload image',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Apply middleware
router.use(authenticateToken);

// Upload routes
router.post('/image', uploadImage);

export default router;
