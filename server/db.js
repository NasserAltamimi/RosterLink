import mongoose from 'mongoose';

// Allow Mongoose's startup index/collection initialization to wait for connect().
// Bound buffering during transient outages rather than leaving requests pending indefinitely.
mongoose.set('bufferTimeoutMS', 5000);

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, writeConcern: { w: 1, j: true } });
}
