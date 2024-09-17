import { useSession } from "next-auth/react";
import SignInInterface from "../components/SignInInterface";

export default function Home() {
  const { data: session } = useSession();

  return (
    <div>
      <h1>CopyTradeCat</h1>
      <SignInInterface />
    </div>
  );
}