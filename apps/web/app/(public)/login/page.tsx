import { Suspense } from "react";
import LoginView from "@/views/login-view";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}
