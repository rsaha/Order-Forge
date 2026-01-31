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
  ChevronDown, ChevronRight, Pencil, X, Check, Plus, Mail, Phone, Key
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import type { User, UserRole, BrandRecord } from "@shared/schema";
import { USER_ROLES } from "@shared/schema";

interface UserWithBrands extends User {
  brandAccess: string[];
  deliveryCompanyAccess?: string[];
  partyAccess?: string[];
}

const DELIVERY_COMPANIES = ["Guided", "Xmaple", "Elmeric"];

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
  const [editingDeliveryCompaniesUserId, setEditingDeliveryCompaniesUserId] = useState<string | null>(null);
  const [editingDeliveryCompanies, setEditingDeliveryCompanies] = useState<string[]>([]);
  const [editingPartyNameUserId, setEditingPartyNameUserId] = useState<string | null>(null);
  const [editingPartyName, setEditingPartyName] = useState("");
  const [editingPartyAccessUserId, setEditingPartyAccessUserId] = useState<string | null>(null);
  const [editingPartyAccess, setEditingPartyAccess] = useState<string[]>([]);
  const [partyAccessInput, setPartyAccessInput] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    Admin: true,
    BrandAdmin: true,
    User: true,
    Customer: true,
  });
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [passwordResetUser, setPasswordResetUser] = useState<UserWithBrands | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newUser, setNewUser] = useState({
    email: "",
    phone: "",
    initialPassword: "",
    firstName: "",
    lastName: "",
    partyName: "",
    role: "User" as "Admin" | "BrandAdmin" | "User" | "Customer",
    brands: [] as string[],
    deliveryCompanies: [] as string[],
    linkedSalesUserId: "",
  });
  const [editingLinkedSalesUserId, setEditingLinkedSalesUserId] = useState<string | null>(null);
  const [editingLinkedSalesUser, setEditingLinkedSalesUser] = useState<string>("");

  const isAdmin = user?.isAdmin === true;

  const { data: users = [], isLoading } = useQuery<UserWithBrands[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdmin,
  });

  const { data: brandRecords = [] } = useQuery<BrandRecord[]>({
    queryKey: ["/api/brands"],
  });

  const { data: partyNames = [] } = useQuery<string[]>({
    queryKey: ["/api/admin/party-names"],
    enabled: isAdmin,
  });

  // Fetch sales users for linking to customer users
  const { data: salesUsers = [] } = useQuery<{ id: string; firstName: string | null; lastName: string | null; phone: string | null; email: string | null }[]>({
    queryKey: ["/api/admin/sales-users"],
    enabled: isAdmin,
  });

  const usersByRole = useMemo(() => {
    const grouped: Record<string, UserWithBrands[]> = {
      Admin: [],
      BrandAdmin: [],
      User: [],
      Customer: [],
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingBrandsUserId(null);
      toast({ title: "Failed to update brand access", description: error.message, variant: "destructive" });
    },
  });

  const updateDeliveryCompaniesMutation = useMutation({
    mutationFn: async ({ userId, deliveryCompanies }: { userId: string; deliveryCompanies: string[] }) => {
      return apiRequest("PUT", `/api/users/${userId}/delivery-company-access`, { deliveryCompanies });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingDeliveryCompaniesUserId(null);
      toast({ title: "Delivery company access updated" });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingDeliveryCompaniesUserId(null);
      toast({ title: "Failed to update delivery companies", description: error.message, variant: "destructive" });
    },
  });

  const updatePartyNameMutation = useMutation({
    mutationFn: async ({ userId, partyName }: { userId: string; partyName: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/party-name`, { partyName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingPartyNameUserId(null);
      toast({ title: "Party name updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update party name", description: error.message, variant: "destructive" });
    },
  });

  const updatePartyAccessMutation = useMutation({
    mutationFn: async ({ userId, partyNames }: { userId: string; partyNames: string[] }) => {
      return apiRequest("PUT", `/api/users/${userId}/party-access`, { partyNames });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingPartyAccessUserId(null);
      setPartyAccessInput("");
      toast({ title: "Party access updated" });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingPartyAccessUserId(null);
      setPartyAccessInput("");
      toast({ title: "Failed to update party access", description: error.message, variant: "destructive" });
    },
  });

  const updateLinkedSalesUserMutation = useMutation({
    mutationFn: async ({ userId, linkedSalesUserId }: { userId: string; linkedSalesUserId: string | null }) => {
      return apiRequest("PATCH", `/api/admin/customers/${userId}/linked-sales-user`, { linkedSalesUserId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingLinkedSalesUserId(null);
      setEditingLinkedSalesUser("");
      toast({ title: "Linked sales user updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update linked sales user", description: error.message, variant: "destructive" });
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

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof newUser) => {
      return apiRequest("POST", "/api/admin/customers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setShowAddUserModal(false);
      setNewUser({
        email: "",
        phone: "",
        initialPassword: "",
        firstName: "",
        lastName: "",
        partyName: "",
        role: "User",
        brands: [],
        deliveryCompanies: [],
        linkedSalesUserId: "",
      });
      toast({ title: "User created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create user", description: error.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/password`, { password });
    },
    onSuccess: () => {
      setPasswordResetUser(null);
      setNewPassword("");
      toast({ title: "Password updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reset password", description: error.message, variant: "destructive" });
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

  const handleEditDeliveryCompanies = (userId: string, currentDeliveryCompanies: string[]) => {
    setEditingDeliveryCompaniesUserId(userId);
    setEditingDeliveryCompanies([...currentDeliveryCompanies]);
  };

  const handleDeliveryCompanyToggle = (company: string) => {
    setEditingDeliveryCompanies(prev =>
      prev.includes(company) ? prev.filter(c => c !== company) : [...prev, company]
    );
  };

  const handleSaveDeliveryCompanies = () => {
    if (editingDeliveryCompaniesUserId) {
      updateDeliveryCompaniesMutation.mutate({ 
        userId: editingDeliveryCompaniesUserId, 
        deliveryCompanies: editingDeliveryCompanies 
      });
    }
  };

  const handleCancelDeliveryCompaniesEdit = () => {
    setEditingDeliveryCompaniesUserId(null);
    setEditingDeliveryCompanies([]);
  };

  const handleEditPartyName = (u: UserWithBrands) => {
    setEditingPartyNameUserId(u.id);
    setEditingPartyName(u.partyName || "");
  };

  const handleSavePartyName = () => {
    if (editingPartyNameUserId) {
      updatePartyNameMutation.mutate({ 
        userId: editingPartyNameUserId, 
        partyName: editingPartyName.trim() 
      });
    }
  };

  const handleCancelPartyNameEdit = () => {
    setEditingPartyNameUserId(null);
    setEditingPartyName("");
  };

  const handleEditPartyAccess = (userId: string, currentPartyAccess: string[]) => {
    setEditingPartyAccessUserId(userId);
    setEditingPartyAccess([...currentPartyAccess]);
    setPartyAccessInput("");
  };

  const handleAddPartyAccess = () => {
    const trimmed = partyAccessInput.trim();
    if (trimmed && !editingPartyAccess.includes(trimmed)) {
      setEditingPartyAccess(prev => [...prev, trimmed]);
    }
    setPartyAccessInput("");
  };

  const handleRemovePartyAccess = (party: string) => {
    setEditingPartyAccess(prev => prev.filter(p => p !== party));
  };

  const handleSavePartyAccess = () => {
    if (editingPartyAccessUserId) {
      updatePartyAccessMutation.mutate({ 
        userId: editingPartyAccessUserId, 
        partyNames: editingPartyAccess 
      });
    }
  };

  const handleCancelPartyAccessEdit = () => {
    setEditingPartyAccessUserId(null);
    setEditingPartyAccess([]);
    setPartyAccessInput("");
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
      case "Customer":
        return <UserIcon className="w-4 h-4 text-green-600 dark:text-green-500" />;
      default:
        return <UserIcon className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getRoleBadgeVariant = (role: string | null) => {
    switch (role) {
      case "Admin": return "destructive";
      case "BrandAdmin": return "secondary";
      case "Customer": return "default";
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
    const isEditingPartyName = editingPartyNameUserId === u.id;
    const isEditingDeliveryCompanies = editingDeliveryCompaniesUserId === u.id;

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

          {u.phone && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPasswordResetUser(u)}
              title="Set Password"
              data-testid={`button-set-password-${u.id}`}
            >
              <Key className="w-4 h-4" />
            </Button>
          )}
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

        <div className="flex flex-wrap items-center gap-3 ml-9 text-xs text-muted-foreground">
          <div className="flex items-center gap-1" data-testid={`text-user-email-${u.id}`}>
            <Mail className="w-3 h-3" />
            <span className="truncate max-w-[180px]">{u.email || "—"}</span>
          </div>
          <div className="flex items-center gap-1" data-testid={`text-user-phone-${u.id}`}>
            <Phone className="w-3 h-3" />
            <span>{u.phone || "—"}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-9">
          <span className="text-xs text-muted-foreground">Brands:</span>
          {isEditingBrands ? (
            <div className="flex flex-wrap items-center gap-1">
              {brandRecords.map((brand) => (
                <Badge
                  key={brand.id}
                  variant={editingBrands.includes(brand.name) ? "default" : "outline"}
                  className="text-xs cursor-pointer"
                  onClick={() => handleBrandToggle(brand.name)}
                  data-testid={`badge-brand-${u.id}-${brand.name}`}
                >
                  {brand.name}
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

        {u.role === "User" && (
          <>
          <div className="flex items-start gap-2 ml-9">
            <span className="text-xs text-muted-foreground pt-1">Linked Parties:</span>
            {editingPartyAccessUserId === u.id ? (
              <div className="flex flex-col gap-2 flex-1">
                <div className="flex flex-wrap items-center gap-1">
                  {editingPartyAccess.map((party) => (
                    <Badge
                      key={party}
                      variant="default"
                      className="text-xs cursor-pointer"
                      onClick={() => handleRemovePartyAccess(party)}
                      data-testid={`badge-party-access-${u.id}-${party.replace(/\s+/g, '-')}`}
                    >
                      {party}
                      <X className="w-3 h-3 ml-1" />
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    value={partyAccessInput}
                    onChange={(e) => setPartyAccessInput(e.target.value)}
                    placeholder="Add party name..."
                    className="text-sm w-48"
                    list={`party-suggestions-${u.id}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddPartyAccess();
                      }
                    }}
                    data-testid={`input-party-access-${u.id}`}
                  />
                  <datalist id={`party-suggestions-${u.id}`}>
                    {partyNames
                      .filter(p => !editingPartyAccess.includes(p))
                      .map(p => (
                        <option key={p} value={p} />
                      ))
                    }
                  </datalist>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={handleAddPartyAccess}
                    disabled={!partyAccessInput.trim()}
                    data-testid={`button-add-party-${u.id}`}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={handleSavePartyAccess}
                    disabled={updatePartyAccessMutation.isPending}
                    data-testid={`button-save-party-access-${u.id}`}
                  >
                    {updatePartyAccessMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelPartyAccessEdit} data-testid={`button-cancel-party-access-${u.id}`}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1">
                {(u.partyAccess && u.partyAccess.length > 0) ? (
                  u.partyAccess.map((party) => (
                    <Badge key={party} variant="secondary" className="text-xs">
                      {party}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => handleEditPartyAccess(u.id, u.partyAccess || [])}
                  className="opacity-60"
                  data-testid={`button-edit-party-access-${u.id}`}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
          
          {/* Show linked customer users for this sales user */}
          <div className="flex items-start gap-2 ml-9">
            <span className="text-xs text-muted-foreground pt-1">Linked Customers:</span>
            <div className="flex flex-wrap items-center gap-1">
              {(() => {
                const linkedCustomers = users.filter(
                  cu => cu.role === "Customer" && cu.linkedSalesUserId === u.id
                );
                if (linkedCustomers.length === 0) {
                  return <span className="text-xs text-muted-foreground">None</span>;
                }
                return linkedCustomers.map((cu) => (
                  <Badge key={cu.id} variant="secondary" className="text-xs" data-testid={`badge-linked-customer-${u.id}-${cu.id}`}>
                    {cu.firstName || cu.lastName 
                      ? `${cu.firstName || ''} ${cu.lastName || ''}`.trim()
                      : cu.partyName || cu.phone || cu.email || cu.id}
                  </Badge>
                ));
              })()}
            </div>
          </div>
          </>
        )}

        {u.role === "Customer" && (
          <>
            <div className="flex items-center gap-2 ml-9">
              <span className="text-xs text-muted-foreground">Party Name:</span>
              {isEditingPartyName ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={editingPartyName}
                    onChange={(e) => setEditingPartyName(e.target.value)}
                    placeholder="Party name"
                    className="text-sm w-48"
                    data-testid={`input-party-name-${u.id}`}
                  />
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={handleSavePartyName}
                    disabled={updatePartyNameMutation.isPending}
                    data-testid={`button-save-party-name-${u.id}`}
                  >
                    {updatePartyNameMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelPartyNameEdit} data-testid={`button-cancel-party-name-${u.id}`}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-sm" data-testid={`text-party-name-${u.id}`}>
                    {u.partyName || <span className="text-muted-foreground">Not set</span>}
                  </span>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => handleEditPartyName(u)}
                    className="opacity-60"
                    data-testid={`button-edit-party-name-${u.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 ml-9">
              <span className="text-xs text-muted-foreground">Sales User:</span>
              {editingLinkedSalesUserId === u.id ? (
                <div className="flex items-center gap-1">
                  <Select
                    value={editingLinkedSalesUser || "none"}
                    onValueChange={(value) => setEditingLinkedSalesUser(value === "none" ? "" : value)}
                  >
                    <SelectTrigger className="w-40 text-xs" data-testid={`select-linked-sales-user-${u.id}`}>
                      <SelectValue placeholder="Select sales user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No linked sales user</SelectItem>
                      {salesUsers.map((su) => (
                        <SelectItem key={su.id} value={su.id}>
                          {su.firstName || su.lastName 
                            ? `${su.firstName || ''} ${su.lastName || ''}`.trim()
                            : su.phone || su.email || su.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => {
                      updateLinkedSalesUserMutation.mutate({
                        userId: u.id,
                        linkedSalesUserId: editingLinkedSalesUser || null
                      });
                    }}
                    disabled={updateLinkedSalesUserMutation.isPending}
                    data-testid={`button-save-linked-sales-user-${u.id}`}
                  >
                    {updateLinkedSalesUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => {
                      setEditingLinkedSalesUserId(null);
                      setEditingLinkedSalesUser("");
                    }}
                    data-testid={`button-cancel-linked-sales-user-${u.id}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-sm" data-testid={`text-linked-sales-user-${u.id}`}>
                    {(() => {
                      const linkedUser = salesUsers.find(su => su.id === u.linkedSalesUserId);
                      if (linkedUser) {
                        return linkedUser.firstName || linkedUser.lastName 
                          ? `${linkedUser.firstName || ''} ${linkedUser.lastName || ''}`.trim()
                          : linkedUser.phone || linkedUser.email || linkedUser.id;
                      }
                      return <span className="text-muted-foreground">Not linked</span>;
                    })()}
                  </span>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => {
                      setEditingLinkedSalesUserId(u.id);
                      setEditingLinkedSalesUser(u.linkedSalesUserId || "");
                    }}
                    className="opacity-60"
                    data-testid={`button-edit-linked-sales-user-${u.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 ml-9">
              <span className="text-xs text-muted-foreground">Delivery Companies:</span>
              {isEditingDeliveryCompanies ? (
                <div className="flex flex-wrap items-center gap-1">
                  {DELIVERY_COMPANIES.map((company) => (
                    <Badge
                      key={company}
                      variant={editingDeliveryCompanies.includes(company) ? "default" : "outline"}
                      className="text-xs cursor-pointer"
                      onClick={() => handleDeliveryCompanyToggle(company)}
                      data-testid={`badge-delivery-${u.id}-${company.toLowerCase()}`}
                    >
                      {company}
                    </Badge>
                  ))}
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={handleSaveDeliveryCompanies}
                    disabled={updateDeliveryCompaniesMutation.isPending}
                    data-testid={`button-save-delivery-${u.id}`}
                  >
                    {updateDeliveryCompaniesMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelDeliveryCompaniesEdit} data-testid={`button-cancel-delivery-${u.id}`}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1">
                  {(u.deliveryCompanyAccess && u.deliveryCompanyAccess.length > 0) ? (
                    u.deliveryCompanyAccess.map((company) => (
                      <Badge key={company} variant="secondary" className="text-xs">
                        {company}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => handleEditDeliveryCompanies(u.id, u.deliveryCompanyAccess || [])}
                    className="opacity-60"
                    data-testid={`button-edit-delivery-${u.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
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
            <Button size="sm" onClick={() => setShowAddUserModal(true)} data-testid="button-add-user">
              <Plus className="w-4 h-4 mr-1" />
              Add User
            </Button>
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
                {renderRoleSection("Customer", usersByRole.Customer)}
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

      <Dialog open={showAddUserModal} onOpenChange={setShowAddUserModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-user-role">Role *</Label>
              <Select
                value={newUser.role}
                onValueChange={(value) => setNewUser(prev => ({ ...prev, role: value as typeof newUser.role }))}
              >
                <SelectTrigger id="new-user-role" data-testid="select-new-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="User">User (Sales Rep)</SelectItem>
                  <SelectItem value="BrandAdmin">Brand Admin</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                  <SelectItem value="Customer">Customer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Provide either email (for Google login) or phone number (for password login)</p>
            <div className="space-y-2">
              <Label htmlFor="new-user-email">Email {newUser.phone.trim() ? "(optional)" : ""}</Label>
              <Input
                id="new-user-email"
                type="email"
                placeholder="user@example.com"
                value={newUser.email}
                onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                data-testid="input-new-user-email"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-user-phone">Phone Number {newUser.email.trim() ? "(optional)" : ""}</Label>
                <Input
                  id="new-user-phone"
                  type="tel"
                  placeholder="9876543210"
                  value={newUser.phone}
                  onChange={(e) => setNewUser(prev => ({ ...prev, phone: e.target.value }))}
                  data-testid="input-new-user-phone"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-password">Password {newUser.phone.trim() ? "*" : "(for phone login)"}</Label>
                <Input
                  id="new-user-password"
                  type="text"
                  placeholder="Min 6 characters"
                  value={newUser.initialPassword}
                  onChange={(e) => setNewUser(prev => ({ ...prev, initialPassword: e.target.value }))}
                  data-testid="input-new-user-password"
                />
              </div>
            </div>
            {newUser.phone.trim() && (
              <p className="text-xs text-muted-foreground">Share this password with the user for phone login</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-user-first-name">First Name</Label>
                <Input
                  id="new-user-first-name"
                  placeholder="First name"
                  value={newUser.firstName}
                  onChange={(e) => setNewUser(prev => ({ ...prev, firstName: e.target.value }))}
                  data-testid="input-new-user-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-last-name">Last Name</Label>
                <Input
                  id="new-user-last-name"
                  placeholder="Last name"
                  value={newUser.lastName}
                  onChange={(e) => setNewUser(prev => ({ ...prev, lastName: e.target.value }))}
                  data-testid="input-new-user-last-name"
                />
              </div>
            </div>
            {newUser.role === "Customer" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="new-user-party-name">Party Name *</Label>
                  <Input
                    id="new-user-party-name"
                    placeholder="Business or party name"
                    value={newUser.partyName}
                    onChange={(e) => setNewUser(prev => ({ ...prev, partyName: e.target.value }))}
                    data-testid="input-new-user-party-name"
                  />
                  <p className="text-xs text-muted-foreground">This will be auto-filled when the customer creates orders</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-user-linked-sales-user">Linked Sales User</Label>
                  <Select
                    value={newUser.linkedSalesUserId || "none"}
                    onValueChange={(value) => setNewUser(prev => ({ ...prev, linkedSalesUserId: value === "none" ? "" : value }))}
                  >
                    <SelectTrigger id="new-user-linked-sales-user" data-testid="select-new-user-linked-sales-user">
                      <SelectValue placeholder="Select sales user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No linked sales user</SelectItem>
                      {salesUsers.map((su) => (
                        <SelectItem key={su.id} value={su.id}>
                          {su.firstName || su.lastName 
                            ? `${su.firstName || ''} ${su.lastName || ''}`.trim()
                            : su.phone || su.email || su.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">The sales user who manages this customer</p>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Allowed Brands</Label>
              <div className="flex flex-wrap gap-2 p-2 border rounded-md">
                {brandRecords.filter(b => b.isActive).map((brand) => (
                  <div key={brand.id} className="flex items-center gap-1">
                    <Checkbox
                      id={`new-user-brand-${brand.id}`}
                      checked={newUser.brands.includes(brand.name)}
                      onCheckedChange={(checked) => {
                        setNewUser(prev => ({
                          ...prev,
                          brands: checked
                            ? [...prev.brands, brand.name]
                            : prev.brands.filter(b => b !== brand.name)
                        }));
                      }}
                    />
                    <Label htmlFor={`new-user-brand-${brand.id}`} className="text-sm cursor-pointer">
                      {brand.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Allowed Delivery Companies</Label>
              <div className="flex flex-wrap gap-2 p-2 border rounded-md">
                {DELIVERY_COMPANIES.map((company) => (
                  <div key={company} className="flex items-center gap-1">
                    <Checkbox
                      id={`new-user-delivery-${company}`}
                      checked={newUser.deliveryCompanies.includes(company)}
                      onCheckedChange={(checked) => {
                        setNewUser(prev => ({
                          ...prev,
                          deliveryCompanies: checked
                            ? [...prev.deliveryCompanies, company]
                            : prev.deliveryCompanies.filter(c => c !== company)
                        }));
                      }}
                    />
                    <Label htmlFor={`new-user-delivery-${company}`} className="text-sm cursor-pointer">
                      {company}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowAddUserModal(false)}
              data-testid="button-cancel-add-user"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => createUserMutation.mutate(newUser)}
              disabled={(!newUser.email.trim() && !newUser.phone.trim()) || (newUser.phone.trim() && newUser.initialPassword.length < 6) || (newUser.role === "Customer" && !newUser.partyName.trim()) || createUserMutation.isPending}
              data-testid="button-save-user"
            >
              {createUserMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create {newUser.role === "Customer" ? "Customer" : newUser.role === "BrandAdmin" ? "Brand Admin" : newUser.role}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordResetUser} onOpenChange={(open) => { if (!open) { setPasswordResetUser(null); setNewPassword(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Set a new password for <span className="font-medium">{passwordResetUser?.firstName || passwordResetUser?.lastName || passwordResetUser?.phone}</span>
            </p>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                data-testid="input-new-password"
              />
              <p className="text-xs text-muted-foreground">Share this password with the user for phone login</p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => { setPasswordResetUser(null); setNewPassword(""); }}
              data-testid="button-cancel-password-reset"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => passwordResetUser && resetPasswordMutation.mutate({ userId: passwordResetUser.id, password: newPassword })}
              disabled={newPassword.length < 6 || resetPasswordMutation.isPending}
              data-testid="button-save-password"
            >
              {resetPasswordMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Key className="w-4 h-4 mr-2" />
              )}
              Set Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
