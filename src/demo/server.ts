import { routes as sortableRoutes } from "./sortable/routes";
import { routes as libraryRoutes } from "./library/routes";
import { routes as todoRoutes } from "./todo/routes";
import { routes as ssrRoutes } from "./ssr/routes";
import { router } from "./trpc";

const app = router({
  ssr: ssrRoutes,
  todo: todoRoutes,
  library: libraryRoutes,
  sortable: sortableRoutes,
});

export { app as router };
export type App = typeof app;
