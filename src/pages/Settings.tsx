import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { IntegrationSettings } from "@/components/settings/IntegrationSettings";
import { SecuritySettings } from "@/components/settings/SecuritySettings";
import { AgentKnowledge } from "@/components/settings/AgentKnowledge";
import { UserManagement } from "@/components/settings/UserManagement";

export default function Settings() {
  const { isManagement } = useAuth();

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your preferences and integrations</p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="h-auto flex-wrap justify-start gap-1 w-full sm:w-auto">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          {isManagement && <TabsTrigger value="users">Users</TabsTrigger>}
          {isManagement && <TabsTrigger value="agent-knowledge">Agent Knowledge</TabsTrigger>}
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          {isManagement && <TabsTrigger value="security">Security</TabsTrigger>}
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <GeneralSettings />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <NotificationSettings />
        </TabsContent>

        {isManagement && (
          <TabsContent value="users" className="space-y-6">
            <UserManagement />
          </TabsContent>
        )}

        {isManagement && (
          <TabsContent value="agent-knowledge" className="space-y-6">
            <AgentKnowledge />
          </TabsContent>
        )}

        <TabsContent value="integrations" className="space-y-6">
          <IntegrationSettings />
        </TabsContent>

        {isManagement && (
          <TabsContent value="security" className="space-y-6">
            <SecuritySettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
