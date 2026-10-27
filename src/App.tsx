import { Navigate, Route, Routes } from "react-router-dom";
import { InvitationCard } from "./pages/InvitationCard";
import { InvitationLanding } from "./pages/InvitationLanding";
import { ProviderSelector } from "./pages/ProviderSelector";
import { ProviderPage } from "./pages/ProviderPage";
import { TelegramQuickPanel } from "./pages/TelegramQuickPanel";

export default function App() {
  return (
    <Routes>
      <Route element={<InvitationLanding />} path="/" />
      <Route element={<TelegramQuickPanel />} path="/tqp" />
      <Route element={<InvitationCard />} path="/invitation" />
      <Route element={<ProviderSelector />} path="/providers" />
      <Route element={<ProviderPage />} path="/mail-flow/:provider" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}
