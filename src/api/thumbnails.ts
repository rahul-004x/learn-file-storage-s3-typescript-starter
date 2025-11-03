import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError } from "./errors";
import { UserForbiddenError } from "./errors";
import path from "path";

const MAX_UPLOAD_SIZE = 10 << 20;

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();
  const file = formData.get("thumbnail");
  if (!(file instanceof File)) {
    throw new BadRequestError("Thumbnail file missing");
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("Thumbnail size should be at most 10MB");
  }

  const arrayBuffer = await file.arrayBuffer();
  const mediaType = file.type;
  const extenstion = mediaType.split("/")[1];

  if (mediaType !== "image/png" && mediaType !== "image/jpeg") {
    throw new BadRequestError("Unsupported file type");
  }

  const filePath = path.join(cfg.assetsRoot, `${videoId}.${extenstion}`);
  const thumbnailURL = `http://localhost:${cfg.port}/${filePath}`;

  await Bun.write(filePath, arrayBuffer);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new BadRequestError("Couldn't find video");
  }

  if (video.userID !== userID) {
    throw new UserForbiddenError("Authorized user has no access to this video");
  }

  const updatedVideo = {
    ...video,
    thumbnailURL,
  };

  updateVideo(cfg.db, updatedVideo);

  console.log("Thumbnail saved at", filePath);

  return respondWithJSON(200, updatedVideo);
}
