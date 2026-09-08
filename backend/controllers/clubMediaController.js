const ClubMedia = require('../models/ClubMedia');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v'];
const IMAGE_DATA_URL_PATTERN = /^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i;
const MAX_IMAGE_DATA_URL_BYTES = 4 * 1024 * 1024;

const publicFields = 'type title caption mediaUrl thumbnailUrl displayOrder isFeatured createdAt';

const getPathExtension = (value) => {
  try {
    const url = new URL(value);
    const pathname = url.pathname.toLowerCase();
    return pathname.slice(pathname.lastIndexOf('.'));
  } catch (error) {
    const cleanValue = String(value || '').split('?')[0].split('#')[0].toLowerCase();
    return cleanValue.slice(cleanValue.lastIndexOf('.'));
  }
};

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ''));

const getDataUrlBytes = (value) => Math.ceil(String(value || '').length * 0.75);

const validateMediaPayload = (payload, isPartial = false) => {
  const type = String(payload.type || '').trim().toLowerCase();
  const mediaUrl = String(payload.mediaUrl || '').trim();
  const thumbnailUrl = String(payload.thumbnailUrl || '').trim();

  if (!isPartial || payload.type !== undefined) {
    if (!['image', 'video'].includes(type)) {
      return 'Media type must be image or video.';
    }
  }

  if (!isPartial || payload.mediaUrl !== undefined) {
    if (!mediaUrl) return 'Media URL is required.';
    if (mediaUrl.includes('..') || mediaUrl.includes('\\')) return 'Invalid media path.';

    if (type === 'image') {
      const isDataImage = IMAGE_DATA_URL_PATTERN.test(mediaUrl);
      const isAllowedImageUrl = isHttpUrl(mediaUrl) && IMAGE_EXTENSIONS.includes(getPathExtension(mediaUrl));
      if (!isDataImage && !isAllowedImageUrl) return 'Images must be JPEG, PNG, or WebP.';
      if (isDataImage && getDataUrlBytes(mediaUrl) > MAX_IMAGE_DATA_URL_BYTES) return 'Image is too large. Maximum is 4 MB after compression.';
    }

    if (type === 'video') {
      if (!isHttpUrl(mediaUrl) || !VIDEO_EXTENSIONS.includes(getPathExtension(mediaUrl))) {
        return 'Videos must use a persistent http(s) MP4, WebM, MOV, or M4V URL.';
      }
    }
  }

  if (thumbnailUrl) {
    const isDataImage = IMAGE_DATA_URL_PATTERN.test(thumbnailUrl);
    const isAllowedImageUrl = isHttpUrl(thumbnailUrl) && IMAGE_EXTENSIONS.includes(getPathExtension(thumbnailUrl));
    if (!isDataImage && !isAllowedImageUrl) return 'Thumbnail must be JPEG, PNG, or WebP.';
    if (isDataImage && getDataUrlBytes(thumbnailUrl) > MAX_IMAGE_DATA_URL_BYTES) return 'Thumbnail is too large. Maximum is 4 MB after compression.';
  }

  return '';
};

const normalizePayload = (body) => {
  const payload = sanitizeObject(body);
  return {
    type: String(payload.type || '').trim().toLowerCase(),
    title: payload.title || '',
    caption: payload.caption || '',
    mediaUrl: payload.mediaUrl || '',
    thumbnailUrl: payload.thumbnailUrl || '',
    displayOrder: Number(payload.displayOrder || 0),
    isActive: payload.isActive !== false,
    isFeatured: Boolean(payload.isFeatured)
  };
};

const getPublicMedia = async (req, res, next) => {
  try {
    const media = await ClubMedia.find({ isActive: true })
      .select(publicFields)
      .sort({ isFeatured: -1, displayOrder: 1, createdAt: -1 })
      .lean();
    res.json(media);
  } catch (error) {
    next(error);
  }
};

const getAdminMedia = async (req, res, next) => {
  try {
    const media = await ClubMedia.find().sort({ displayOrder: 1, createdAt: -1 });
    res.json(media);
  } catch (error) {
    next(error);
  }
};

const createMedia = async (req, res, next) => {
  try {
    const payload = normalizePayload(req.body);
    const validationError = validateMediaPayload(payload);
    if (validationError) return res.status(400).json({ message: validationError });

    const media = await ClubMedia.create(payload);
    await createAuditLog({ userId: req.user._id, action: 'create club media', entity: 'ClubMedia', entityId: media._id, req });
    res.status(201).json(media);
  } catch (error) {
    next(error);
  }
};

const updateMedia = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) return res.status(400).json({ message: 'Invalid media ID.' });

    const existing = await ClubMedia.findById(id);
    if (!existing) return res.status(404).json({ message: 'Media item not found.' });

    const payload = normalizePayload({ ...existing.toObject(), ...sanitizeObject(req.body) });
    const validationError = validateMediaPayload(payload, true);
    if (validationError) return res.status(400).json({ message: validationError });

    Object.assign(existing, payload);
    await existing.save();
    await createAuditLog({ userId: req.user._id, action: 'update club media', entity: 'ClubMedia', entityId: existing._id, req });
    res.json(existing);
  } catch (error) {
    next(error);
  }
};

const deleteMedia = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) return res.status(400).json({ message: 'Invalid media ID.' });
    const media = await ClubMedia.findByIdAndDelete(id);
    if (!media) return res.status(404).json({ message: 'Media item not found.' });
    await createAuditLog({ userId: req.user._id, action: 'delete club media', entity: 'ClubMedia', entityId: media._id, req });
    res.json({ message: 'Media deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getPublicMedia, getAdminMedia, createMedia, updateMedia, deleteMedia };
