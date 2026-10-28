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
  deliveryType: "authenticated";
}

type DeliveryType = "authenticated" | "upload";

export function signUpload(userId: string, safeName: string): SignedUpload {
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const publicId = `${CLOUDINARY_FOLDER}/${userId}/${unique}-${safeName || "file"}`;
  const paramsToSign = {
    timestamp: Math.floor(Date.now() / 1000),
    public_id: publicId,
    type: "authenticated",
  };
  const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET!);
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    timestamp: paramsToSign.timestamp,
    signature,
    publicId,
    resourceType: "raw",
    deliveryType: "authenticated",
  };
}

export function signedDownloadUrl(publicId: string, deliveryType: DeliveryType = "authenticated"): string {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour expiration
  const hasExt = publicId.lastIndexOf(".") > publicId.lastIndexOf("/");
  const format = hasExt ? "" : "";

  try {
    return cloudinary.utils.private_download_url(publicId, format, {
      resource_type: "raw",
      type: deliveryType,
      expires_at: expiresAt,
      attachment: true,
    });
  } catch {
    return cloudinary.url(publicId, {
      resource_type: "raw",
      type: deliveryType,
      secure: true,
      sign_url: true,
    });
  }
}

function isCloudinaryNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { http_code?: number; error?: { message?: string } };
  if (e.http_code === 404) return true;
  return e.error?.message?.toLowerCase().includes("not found") ?? false;
}

async function getResource(publicId: string, deliveryType: DeliveryType) {
  return cloudinary.api.resource(publicId, { resource_type: "raw", type: deliveryType });
}

async function fetchResourceWithDeliveryType(
  publicId: string
): Promise<{ deliveryType: DeliveryType; resource: { bytes?: number } } | null> {
  try {
    const resource = (await getResource(publicId, "authenticated")) as { bytes?: number };
    return { deliveryType: "authenticated", resource };
  } catch (error: unknown) {
    if (!isCloudinaryNotFound(error)) throw error;
  }

  try {
    const resource = (await getResource(publicId, "upload")) as { bytes?: number };
    return { deliveryType: "upload", resource };
  } catch (error: unknown) {
    if (!isCloudinaryNotFound(error)) throw error;
  }

  return null;
}

export async function detectResourceDeliveryType(publicId: string): Promise<DeliveryType | null> {
  const found = await fetchResourceWithDeliveryType(publicId);
  return found ? found.deliveryType : null;
}

export async function resolveSignedDownloadUrl(publicId: string): Promise<string> {
  const found = await fetchResourceWithDeliveryType(publicId);
  if (!found) {
    throw new Error("File not found in storage.");
  }
  return signedDownloadUrl(publicId, found.deliveryType);
}

export async function getResourceBytes(publicId: string): Promise<number> {
  const found = await fetchResourceWithDeliveryType(publicId);
  if (!found) return 0;
  return Number(found.resource.bytes || 0);
}

export async function deleteResource(publicIds: string | string[]): Promise<void> {
  await cloudinary.api.delete_resources(Array.isArray(publicIds) ? publicIds : [publicIds], {
    resource_type: "raw",
  });
}