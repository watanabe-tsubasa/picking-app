import { Link, NavLink, Outlet } from "react-router";

export default function EditLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-sm text-gray-300 hover:text-white">
          ← トップ
        </Link>
        <h1 className="text-xl font-bold">マスタ編集</h1>
        <div className="w-12" />
      </header>
      <nav className="bg-white border-b px-6 py-2 flex gap-4">
        <NavLink
          to="/edit/store"
          className={({ isActive }) =>
            `px-4 py-2 rounded ${isActive ? "bg-gray-200 font-medium" : "hover:bg-gray-100"}`
          }
        >
          店舗
        </NavLink>
        <NavLink
          to="/edit/worker"
          className={({ isActive }) =>
            `px-4 py-2 rounded ${isActive ? "bg-gray-200 font-medium" : "hover:bg-gray-100"}`
          }
        >
          作業者
        </NavLink>
      </nav>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
