import { redirect } from "react-router";

export function loader() {
  return redirect("/edit/store");
}

export default function EditIndex() {
  return null;
}
