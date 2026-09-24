import { Redis } from "ioredis";

export class RedisClient {
  private client: Redis;
  private connecting: Promise<void> | null = null;

  constructor(
    private readonly redisUrl: string,
    private readonly onError?: (error: Error) => void,
  ) {
    this.client = this.createClient();
  }

  async ping(): Promise<void> {
    if (this.client.status === "end") {
      this.client = this.createClient();
    }
    if (this.client.status === "wait") {
      this.connecting ??= this.client.connect();
      try {
        await this.connecting;
      } finally {
        this.connecting = null;
      }
    }

    const reply = await this.client.ping();
    if (reply !== "PONG") {
      throw new Error(`Unexpected Redis ping reply: ${reply}`);
    }
  }

  async close(): Promise<void> {
    this.connecting = null;
    if (this.client.status === "wait" || this.client.status === "end") {
      this.client.disconnect();
      return;
    }
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  private createClient(): Redis {
    const client = new Redis(this.redisUrl, {
      lazyConnect: true,
      connectTimeout: 2_000,
      commandTimeout: 2_000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    client.on("error", (error: Error) => {
      this.onError?.(error);
    });
    return client;
  }
}
