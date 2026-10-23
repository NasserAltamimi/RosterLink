export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) fields[issue.path.join('.') || 'form'] ??= issue.message;
    throw new HttpError(400, 'Please check the highlighted fields.', fields);
  }
  return result.data;
}

export function handleError(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.code === 11000) {
    const message = error.keyPattern?.email ? 'An account with this email already exists.'
      : error.keyPattern?.owner ? 'You already have a player profile.' : 'You already added this game section.';
    return res.status(409).json({ message });
  }
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Choose an image smaller than 5 MB.' });
  if (error.name === 'MulterError') return res.status(400).json({ message: 'Upload one image using the image field.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'The request is too large.' });
  if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ message: 'Invalid JSON.' });
  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message, ...(error.fields ? { fields: error.fields } : {}) });
  if (error.status === 404) return res.status(404).json({ message: 'The requested resource was not found.' });
  if (error.status === 400) return res.status(400).json({ message: 'Invalid request.' });
  // Log only a category, never request bodies, credentials, or session IDs.
  console.error('Request failed:', error.name);
  return res.status(500).json({ message: 'Something went wrong. Please try again.' });
}
