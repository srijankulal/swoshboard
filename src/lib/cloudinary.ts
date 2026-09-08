import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const CLOUDINARY_FOLDER = "swoshboard";

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
  );
}

export interface SignedUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  resourceType: "raw";
}

export function signUpload(userId: string, safeName: string): SignedUpload {
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const publicId = `${CLOUDINARY_FOLDER}/${userId}/${unique}-${safeName || "file"}`;
  const paramsToSign = {
    timestamp: Math.floor(Date.now() / 1000),
    public_id: publicId,
    access_mode: "authenticated",
  };
  const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET!);
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    timestamp: paramsToSign.timestamp,
    signature,
    publicId,
    resourceType: "raw",
  };
}

export function signedDownloadUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    resource_type: "raw",
    type: "authenticated",
    secure: true,
    sign_url: true,
  });
}

export async function getResourceBytes(publicId: string): Promise<number> {
  const resource = await cloudinary.api.resource(publicId, { resource_type: "raw" });
  return Number((resource as { bytes?: number }).bytes || 0);
}

export async function deleteResource(publicIds: string | string[]): Promise<void> {
  await cloudinary.api.delete_resources(Array.isArray(publicIds) ? publicIds : [publicIds], {
    resource_type: "raw",
  });
}