import { routes as todoRoutes } from "./todo/routes";
import { router } from "./trpc";

const app = router({
  todo: todoRoutes,
});

export { app as router };
export type App = typeof app;
