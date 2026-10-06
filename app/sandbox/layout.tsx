import SandboxLayout from "@/components/shell/SandboxLayout";

export const metadata = {
  title: "Sandbox",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SandboxLayout>{children}</SandboxLayout>;
}
