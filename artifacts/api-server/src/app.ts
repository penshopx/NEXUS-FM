import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
// Portfolio import is intentionally a bounded plain-text upload.  Keeping it
// separate from multipart avoids a file parser and ensures the limit is
// applied before the facilities route sees the payload.
app.use(express.text({ type: ["text/csv", "text/plain"], limit: "2mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

app.use((
  error: unknown,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  const bodyError = error as { type?: string };
  if (bodyError?.type === "entity.too.large" && req.is(["text/csv", "text/plain"])) {
    res.status(413)
      .type("text/csv")
      .set("Content-Disposition", 'attachment; filename="facility-portfolio-import-errors.csv"')
      .send('row,error\n1,"CSV exceeds the 2097152-byte limit"\n');
    return;
  }
  next(error);
});

export default app;
