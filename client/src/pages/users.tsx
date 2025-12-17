import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Shield, ShieldCheck, User as UserIcon, Save, Loader2 } from "lucide-react";
import type { User, UserRole, Brand } from "@shared/schema";
import { BRAND_OPTIONS, USER_ROLES } from "@shared/schema";

interface UserWithBrands extends User {
  brandAccess: string[];
}

export default function UsersPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingBrands, setEditingBrands] = useState<string[]>([]);

  const isAdmin = user?.isAdmin === true;

  const { data: users = [], isLoading } = useQuery<UserWithBrands[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdmin,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Role updated",
        description: "User role has been changed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update role",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateBrandsMutation = useMutation({
    mutationFn: async ({ userId, brands }: { userId: string; brands: string[] }) => {
      return apiRequest("PUT", `/api/users/${userId}/brand-access`, { brands });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingUserId(null);
      toast({
        title: "Brand access updated",
        description: "User brand access has been saved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update brand access",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRoleChange = (userId: string, role: string) => {
    updateRoleMutation.mutate({ userId, role });
  };

  const handleEditBrands = (userId: string, currentBrands: string[]) => {
    setEditingUserId(userId);
    setEditingBrands([...currentBrands]);
  };

  const handleBrandToggle = (brand: string) => {
    setEditingBrands(prev =>
      prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
    );
  };

  const handleSaveBrands = () => {
    if (editingUserId) {
      updateBrandsMutation.mutate({ userId: editingUserId, brands: editingBrands });
    }
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditingBrands([]);
  };

  const getRoleIcon = (role: string | null) => {
    switch (role) {
      case "Admin":
        return <ShieldCheck className="w-4 h-4 text-destructive" />;
      case "BrandAdmin":
        return <Shield className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />;
      default:
        return <UserIcon className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getRoleBadgeVariant = (role: string | null) => {
    switch (role) {
      case "Admin":
        return "destructive";
      case "BrandAdmin":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-6 text-center">
          <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">Only administrators can access this page.</p>
          <Button onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Home
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between gap-4 px-4 h-16">
          <Header onCartClick={() => {}} cartItemCount={0} isAdmin={isAdmin} showTabs={false} />
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b bg-card">
          <div className="flex items-center gap-4 px-4 py-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold" data-testid="text-page-title">User Management</h1>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-muted-foreground">No users found</p>
              </Card>
            ) : (
              users.map((u) => (
                <Card key={u.id} className="p-4" data-testid={`card-user-${u.id}`}>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={u.profileImageUrl || undefined} alt={u.firstName || "User"} />
                        <AvatarFallback>
                          {(u.firstName?.[0] || u.email?.[0] || "U").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate" data-testid={`text-user-name-${u.id}`}>
                          {u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "Unnamed User"}
                        </p>
                        <p className="text-sm text-muted-foreground truncate" data-testid={`text-user-email-${u.id}`}>
                          {u.email || "No email"}
                        </p>
                      </div>
                      <Badge variant={getRoleBadgeVariant(u.role) as any} className="flex items-center gap-1">
                        {getRoleIcon(u.role)}
                        {u.role || "User"}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <Label className="text-sm text-muted-foreground min-w-16">Role:</Label>
                      <Select
                        value={u.role || "User"}
                        onValueChange={(value) => handleRoleChange(u.id, value)}
                        disabled={updateRoleMutation.isPending}
                      >
                        <SelectTrigger className="w-40" data-testid={`select-role-${u.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {USER_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              <div className="flex items-center gap-2">
                                {getRoleIcon(role)}
                                {role}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-sm text-muted-foreground">Brand Access:</Label>
                        {editingUserId === u.id ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEdit}
                              disabled={updateBrandsMutation.isPending}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSaveBrands}
                              disabled={updateBrandsMutation.isPending}
                              data-testid={`button-save-brands-${u.id}`}
                            >
                              {updateBrandsMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4 mr-1" />
                              )}
                              Save
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditBrands(u.id, u.brandAccess)}
                            data-testid={`button-edit-brands-${u.id}`}
                          >
                            Edit
                          </Button>
                        )}
                      </div>

                      {editingUserId === u.id ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {BRAND_OPTIONS.map((brand) => (
                            <div key={brand} className="flex items-center space-x-2">
                              <Checkbox
                                id={`brand-${u.id}-${brand}`}
                                checked={editingBrands.includes(brand)}
                                onCheckedChange={() => handleBrandToggle(brand)}
                                data-testid={`checkbox-brand-${u.id}-${brand}`}
                              />
                              <Label
                                htmlFor={`brand-${u.id}-${brand}`}
                                className="text-sm cursor-pointer"
                              >
                                {brand}
                              </Label>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.brandAccess.length > 0 ? (
                            u.brandAccess.map((brand) => (
                              <Badge key={brand} variant="secondary" className="text-xs">
                                {brand}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">No brands assigned</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
