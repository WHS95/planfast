import { appSettings } from "@/lib/repo";
import { SettingsForm } from "@/components/SettingsForm";
export default function Page() {
  return (
    <div className="flex-1 overflow-y-auto"><div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-xl font-semibold mb-6">설정</h1>
      <SettingsForm initial={appSettings.get()} />
    </div></div>
  );
}
