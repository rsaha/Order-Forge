import { useState, useMemo } from "react";
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
import { Input } from "@/components/ui/input";
import { 
  ArrowLeft, Shield, ShieldCheck, User as UserIcon, Save, Loader2, Trash2, 
  ChevronDown, ChevronRight, Pencil, X, Check
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { User, UserRole } from "@shared/schema";
import { BRAND_OPTIONS, USER_ROLES } from "@shared/schema";

interface UserWithBrands extends User {
  brandAccess: string[];
}

export default function UsersPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [editingBrandsUserId, setEditingBrandsUserId] = useState<string | null>(null);
  const [editingBrands, setEditingBrands] = useState<string[]>([]);
  const [editingNameUserId, setEditingNameUserId] = useState<string | null>(null);
  const [editingFirstName, setEditingFirstName] = useState("");
  const [editingLastName, setEditingLastName] = useState("");
  const [userToDelete, setUserToDelete] = useState<UserWithBrands | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    Admin: true,
    BrandAdmin: true,
    User: true,
  });

  const isAdmin = user?.isAdmin === true;

  const { data: users = [], isLoading } = useQuery<UserWithBrands[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdmin,
  });

  const usersByRole = useMemo(() => {
    const grouped: Record<string, UserWithBrands[]> = {
      Admin: [],
      BrandAdmin: [],
      User: [],
    };
    
    users.forEach((u) => {
      const role = u.role || "User";
      if (grouped[role]) {
        grouped[role].push(u);
      } else {
        grouped["User"].push(u);
      }
    });
    
    return grouped;
  }, [users]);

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: async ({ userId, firstName, lastName }: { userId: string; firstName: string; lastName: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/name`, { firstName, lastName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingNameUserId(null);
      toast({ title: "Name updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update name", description: error.message, variant: "destructive" });
    },
  });

  const updateBrandsMutation = useMutation({
    mutationFn: async ({ userId, brands }: { userId: string; brands: string[] }) => {
      return apiRequest("PUT", `/api/users/${userId}/brand-access`, { brands });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingBrandsUserId(null);
      toast({ title: "Brand access updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update brand access", description: error.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setUserToDelete(null);
      toast({ title: "User deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete user", description: error.message, variant: "destructive" });
    },
  });

  const handleRoleChange = (userId: string, role: string) => {
    updateRoleMutation.mutate({ userId, role });
  };

  const handleEditName = (u: UserWithBrands) => {
    setEditingNameUserId(u.id);
    setEditingFirstName(u.firstName || "");
    setEditingLastName(u.lastName || "");
  };

  const handleSaveName = () => {
    if (editingNameUserId) {
      updateNameMutation.mutate({ 
        userId: editingNameUserId, 
        firstName: editingFirstName.trim(), 
        lastName: editingLastName.trim() 
      });
    }
  };

  const handleCancelNameEdit = () => {
    setEditingNameUserId(null);
    setEditingFirstName("");
    setEditingLastName("");
  };

  const handleEditBrands = (userId: string, currentBrands: string[]) => {
    setEditingBrandsUserId(userId);
    setEditingBrands([...currentBrands]);
  };

  const handleBrandToggle = (brand: string) => {
    setEditingBrands(prev =>
      prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
    );
  };

  const handleSaveBrands = () => {
    if (editingBrandsUserId) {
      updateBrandsMutation.mutate({ userId: editingBrandsUserId, brands: editingBrands });
    }
  };

  const handleCancelBrandsEdit = () => {
    setEditingBrandsUserId(null);
    setEditingBrands([]);
  };

  const toggleSection = (role: string) => {
    setExpandedSections(prev => ({ ...prev, [role]: !prev[role] }));
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
      case "Admin": return "destructive";
      case "BrandAdmin": return "secondary";
      default: return "outline";
    }
  };

  const getDisplayName = (u: UserWithBrands) => {
    if (u.firstName || u.lastName) {
      return `${u.firstName || ""} ${u.lastName || ""}`.trim();
    }
    return u.email?.split("@")[0] || "Unnamed";
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

  const renderUserRow = (u: UserWithBrands) => {
    const isEditingName = editingNameUserId === u.id;
    const isEditingBrands = editingBrandsUserId === u.id;

    return (
      <div 
        key={u.id} 
        className="flex flex-col gap-2 py-2 px-3 border-b last:border-b-0 hover-elevate"
        data-testid={`row-user-${u.id}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="w-7 h-7 flex-shrink-0">
            <AvatarImage src={u.profileImageUrl || undefined} alt={u.firstName || "User"} />
            <AvatarFallback className="text-xs">
              {(u.firstName?.[0] || u.email?.[0] || "U").toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {isEditingName ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Input
                value={editingFirstName}
                onChange={(e) => setEditingFirstName(e.target.value)}
                placeholder="First"
                className="text-sm w-24"
                data-testid={`input-firstname-${u.id}`}
              />
              <Input
                value={editingLastName}
                onChange={(e) => setEditingLastName(e.target.value)}
                placeholder="Last"
                className="text-sm w-24"
                data-testid={`input-lastname-${u.id}`}
              />
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={handleSaveName}
                disabled={updateNameMutation.isPending}
                data-testid={`button-save-name-${u.id}`}
              >
                {updateNameMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={handleCancelNameEdit} data-testid={`button-cancel-name-${u.id}`}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <span className="font-medium text-sm truncate" data-testid={`text-user-name-${u.id}`}>
                {getDisplayName(u)}
              </span>
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={() => handleEditName(u)}
                className="opacity-60"
                data-testid={`button-edit-name-${u.id}`}
              >
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          )}

          <span className="text-xs text-muted-foreground truncate max-w-[150px] hidden sm:block" data-testid={`text-user-email-${u.id}`}>
            {u.email}
          </span>

          <Select
            value={u.role || "User"}
            onValueChange={(value) => handleRoleChange(u.id, value)}
            disabled={updateRoleMutation.isPending}
          >
            <SelectTrigger className="w-28 text-xs" data-testid={`select-role-${u.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USER_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  <div className="flex items-center gap-1">
                    {getRoleIcon(role)}
                    <span className="text-xs">{role}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {u.id !== user?.id && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setUserToDelete(u)}
              className="text-destructive"
              data-testid={`button-delete-user-${u.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-9">
          <span className="text-xs text-muted-foreground">Brands:</span>
          {isEditingBrands ? (
            <div className="flex flex-wrap items-center gap-1">
              {BRAND_OPTIONS.map((brand) => (
                <Badge
                  key={brand}
                  variant={editingBrands.includes(brand) ? "default" : "outline"}
                  className="text-xs cursor-pointer"
                  onClick={() => handleBrandToggle(brand)}
                  data-testid={`badge-brand-${u.id}-${brand}`}
                >
                  {brand}
                </Badge>
              ))}
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={handleSaveBrands}
                disabled={updateBrandsMutation.isPending}
                data-testid={`button-save-brands-${u.id}`}
              >
                {updateBrandsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelBrandsEdit} data-testid={`button-cancel-brands-${u.id}`}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {u.brandAccess.length > 0 ? (
                u.brandAccess.map((brand) => (
                  <Badge key={brand} variant="secondary" className="text-xs">
                    {brand}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">None</span>
              )}
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => handleEditBrands(u.id, u.brandAccess)}
                className="opacity-60"
                data-testid={`button-edit-brands-${u.id}`}
              >
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRoleSection = (role: string, usersInRole: UserWithBrands[]) => {
    const isExpanded = expandedSections[role];
    const count = usersInRole.length;

    return (
      <Collapsible key={role} open={isExpanded} onOpenChange={() => toggleSection(role)}>
        <CollapsibleTrigger asChild>
          <div 
            className="flex items-center gap-2 px-3 py-2 bg-muted/50 cursor-pointer hover-elevate rounded-t-md"
            data-testid={`button-toggle-${role.toLowerCase()}-section`}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {getRoleIcon(role)}
            <span className="font-medium text-sm">{role}s</span>
            <Badge variant={getRoleBadgeVariant(role) as any} className="text-xs">
              {count}
            </Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="rounded-t-none border-t-0">
            {usersInRole.length > 0 ? (
              usersInRole.map(renderUserRow)
            ) : (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No {role.toLowerCase()}s
              </div>
            )}
          </Card>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between gap-4 px-4 h-14">
          <Header onCartClick={() => {}} cartItemCount={0} isAdmin={isAdmin} showTabs={false} />
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b bg-card">
          <div className="flex items-center gap-2 px-4 py-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold" data-testid="text-page-title">User Management</h1>
            <Badge variant="outline" className="ml-auto">
              {users.length} users
            </Badge>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3 max-w-4xl mx-auto">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-muted-foreground">No users found</p>
              </Card>
            ) : (
              <>
                {renderRoleSection("Admin", usersByRole.Admin)}
                {renderRoleSection("BrandAdmin", usersByRole.BrandAdmin)}
                {renderRoleSection("User", usersByRole.User)}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{userToDelete?.firstName || userToDelete?.email || 'this user'}"? 
              This will remove their account and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteUserMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
