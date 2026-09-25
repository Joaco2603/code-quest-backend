type NetworkRequest = {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
};

export function requestNetwork(request: NetworkRequest) {
  const forwarded = request.headers?.['x-forwarded-for'];
  return {
    ip: request.ip,
    peerIp: request.socket?.remoteAddress,
    // Diagnostic input only. Authentication/rate limits must use resolved ip.
    forwardedFor: (Array.isArray(forwarded)
      ? forwarded.join(', ')
      : forwarded
    )?.slice(0, 2048),
  };
}
