import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  ArrowLeft, Plus, Pencil, Trash2, X, Check, Loader2, Tag
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BrandRecord } from "@shared/schema";

export default function BrandsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<BrandRecord | null>(null);
  const [brandToDelete, setBrandToDelete] = useState<BrandRecord | null>(null);
  const [newBrandName, setNewBrandName] = useState("");
  const [editBrandName, setEditBrandName] = useState("");
  const [editBrandActive, setEditBrandActive] = useState(true);

  const isAdmin = user?.isAdmin === true;

  const { data: brands = [], isLoading } = useQuery<BrandRecord[]>({
    queryKey: ["/api/admin/brands"],
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", "/api/admin/brands", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/brands"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      setIsAddDialogOpen(false);
      setNewBrandName("");
      toast({ title: "Brand created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create brand", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, isActive }: { id: string; name: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/admin/brands/${id}`, { name, isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/brands"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      setEditingBrand(null);
      toast({ title: "Brand updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update brand", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/brands/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/brands"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      setBrandToDelete(null);
      toast({ title: "Brand deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete brand", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (brand: BrandRecord) => {
    setEditingBrand(brand);
    setEditBrandName(brand.name);
    setEditBrandActive(brand.isActive);
  };

  const handleSaveEdit = () => {
    if (editingBrand && editBrandName.trim()) {
      updateMutation.mutate({ 
        id: editingBrand.id, 
        name: editBrandName.trim(), 
        isActive: editBrandActive 
      });
    }
  };

  const handleCreate = () => {
    if (newBrandName.trim()) {
      createMutation.mutate(newBrandName.trim());
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background">
        <div className="flex items-center justify-between p-4">
          <Header 
            cartItemCount={0}
            onCartClick={() => {}}
            isAdmin={isAdmin}
          />
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Brand Management</h1>
            <p className="text-muted-foreground text-sm">
              Add, edit, or deactivate brands
            </p>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-brand">
            <Plus className="w-4 h-4 mr-2" />
            Add Brand
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : brands.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Tag className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No brands configured yet.</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setIsAddDialogOpen(true)}
              >
                Add your first brand
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {brands.map((brand) => (
              <Card key={brand.id} data-testid={`card-brand-${brand.id}`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Tag className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium" data-testid={`text-brand-name-${brand.id}`}>
                        {brand.name}
                      </span>
                      <Badge 
                        variant={brand.isActive ? "default" : "secondary"}
                        data-testid={`badge-brand-status-${brand.id}`}
                      >
                        {brand.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(brand)}
                        data-testid={`button-edit-brand-${brand.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setBrandToDelete(brand)}
                        data-testid={`button-delete-brand-${brand.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Brand</DialogTitle>
            <DialogDescription>
              Enter a name for the new brand. It will be active by default.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="brand-name">Brand Name</Label>
            <Input
              id="brand-name"
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              placeholder="Enter brand name"
              data-testid="input-new-brand-name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreate} 
              disabled={!newBrandName.trim() || createMutation.isPending}
              data-testid="button-confirm-add-brand"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Brand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingBrand} onOpenChange={(open) => !open && setEditingBrand(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Brand</DialogTitle>
            <DialogDescription>
              Update the brand name or change its active status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-brand-name">Brand Name</Label>
              <Input
                id="edit-brand-name"
                value={editBrandName}
                onChange={(e) => setEditBrandName(e.target.value)}
                placeholder="Enter brand name"
                data-testid="input-edit-brand-name"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="brand-active">Active</Label>
              <Switch
                id="brand-active"
                checked={editBrandActive}
                onCheckedChange={setEditBrandActive}
                data-testid="switch-brand-active"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBrand(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdit} 
              disabled={!editBrandName.trim() || updateMutation.isPending}
              data-testid="button-confirm-edit-brand"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!brandToDelete} onOpenChange={(open) => !open && setBrandToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Brand</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{brandToDelete?.name}"? This action cannot be undone.
              Products using this brand will need to be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => brandToDelete && deleteMutation.mutate(brandToDelete.id)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-brand"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
