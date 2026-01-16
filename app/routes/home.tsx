import { Link } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ピッキング効率計測アプリ" },
    { name: "description", content: "ネットスーパー売り場でのピッキング効率計測" },
  ];
}

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">
        ピッキング効率計測アプリ
      </h1>
      <nav className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          to="/picking/register"
          className="block w-full px-6 py-4 bg-gray-900 text-white text-center text-lg font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          ピッキング測定
        </Link>
        <Link
          to="/dashboard"
          className="block w-full px-6 py-4 bg-gray-900 text-white text-center text-lg font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          ダッシュボード
        </Link>
        <Link
          to="/edit"
          className="block w-full px-6 py-4 bg-white text-gray-900 text-center text-lg font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          マスタ編集
        </Link>
      </nav>
    </div>
  );
}
