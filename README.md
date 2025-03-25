# BeatInBox Express Backend

## Environment Variables

Add the following variables to your `.env` file:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/beatinbox"

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_KEY="your_api_key"
CLOUDINARY_API_SECRET="your_api_secret"
```

## Testing the Upload Endpoint

To test the image upload endpoint:

```bash
curl -X POST http://localhost:3001/mobile/uploads/image \
  -H "Content-Type: application/json" \
  -H "x-session-token: your_session_token" \
  -d '{
    "assets": [{
      "uri": "https://example.com/image.jpg"
    }]
  }'
```

The endpoint will:
1. Upload the image to Cloudinary
2. Automatically update the user's profile image with the new URL
3. Return the Cloudinary URL and public ID:

```json
{
  "success": true,
  "data": {
    "url": "https://res.cloudinary.com/your-cloud/image/upload/...",
    "publicId": "profile-images/..."
  }
}
```

Note: The image URL is automatically saved to the user's profile in the database. You can access the user's profile image through the user endpoints.

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up your environment variables in `.env`

3. Start the development server:
```bash
npm run dev
```

The server will be running at http://localhost:3001
