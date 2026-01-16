import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),

  // Picking routes (mobile-first)
  layout("routes/picking/layout.tsx", [
    route("picking/register", "routes/picking/register.tsx"),
    route("picking/pick", "routes/picking/pick.tsx"),
  ]),

  // Dashboard routes (PC-first)
  layout("routes/dashboard/layout.tsx", [
    route("dashboard", "routes/dashboard/index.tsx"),
    route("dashboard/result", "routes/dashboard/result.tsx"),
  ]),

  // Edit routes (PC-first)
  layout("routes/edit/layout.tsx", [
    route("edit", "routes/edit/index.tsx"),
    route("edit/worker", "routes/edit/worker.tsx"),
    route("edit/store", "routes/edit/store.tsx"),
  ]),
] satisfies RouteConfig;
