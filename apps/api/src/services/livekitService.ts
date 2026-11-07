import { AccessToken } from 'livekit-server-sdk';
import jwt from 'jsonwebtoken';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://demo.livekit.cloud';
const FALLBACK_SECRET = process.env.JWT_SECRET || 'clubroom-dev-secret-key-2026';

export interface TokenOptions {
  roomName: string;
  participantName: string;
  participantIdentity: string;
  isHost?: boolean;
}

export async function createLiveKitToken({
  roomName,
  participantName,
  participantIdentity,
  isHost = false
}: TokenOptions): Promise<{ token: string; serverUrl: string; isLiveKitCloud: boolean }> {
  // If LiveKit credentials are configured in environment
  if (LIVEKIT_API_KEY && LIVEKIT_API_SECRET) {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participantIdentity,
      name: participantName
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: isHost
    });

    const token = await at.toJwt();
    return {
      token,
      serverUrl: LIVEKIT_URL,
      isLiveKitCloud: true
    };
  }

  // Fallback: Generate signed token with identical structure for local dev / testing
  const token = jwt.sign(
    {
      sub: participantIdentity,
      name: participantName,
      video: {
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: isHost
      }
    },
    FALLBACK_SECRET,
    { expiresIn: '6h' }
  );

  return {
    token,
    serverUrl: LIVEKIT_URL,
    isLiveKitCloud: false
  };
}

