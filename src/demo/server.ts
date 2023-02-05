import { routes as sortableRoutes } from "./sortable/routes";
import { routes as libraryRoutes } from "./library/routes";
import { routes as todoRoutes } from "./todo/routes";
import { router } from "./trpc";

const app = router({
  todo: todoRoutes,
  library: libraryRoutes,
  sortable: sortableRoutes,
});

export { app as router };
export type App = typeof app;
