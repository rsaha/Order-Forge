import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Truck,
  Package,
  Loader2,
  Settings,
  Check,
  ChevronRight,
  BoxesIcon,
  MapPin,
  RefreshCw,
} from "lucide-react";
import TransportFlyout from "./TransportFlyout";

interface TransportRate {
  id: string;
  carrierId: string;
  location: string;
  rate: string | null;
  minRate: string | null;
  maxRate: string | null;
  tat: string | null;
  rateNote: string | null;
}

interface TransportCarrier {
  id: string;
  name: string;
  type: string;
  notes: string | null;
  isActive: boolean;
  rates: TransportRate[];
}

interface CarrierCost {
  matched: boolean;
  rate: number | null;
  minRate: number | null;
  maxRate: number | null;
  estimatedCost: number | null;
  location: string | null;
}

interface UnassignedGroup {
  partyName: string;
  orderCount: number;
  totalCases: number;
  orderIds: string[];
  caseSizes: number[];
  carrierCosts: Record<string, CarrierCost>;
}

export interface AssignedGroup {
  dispatchBy: string;
  orderCount: number;
  totalCases: number;
  orderIds: string[];
  estimatedCost: number | null;
}

interface PredictData {
  carriers: TransportCarrier[];
  unassigned: UnassignedGroup[];
  assigned: AssignedGroup[];
}

function formatINR(n: number | string | null | undefined) {
  if (n === null || n === undefined || n === "") return "-";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 }).format(Number(n));
}

export default function TransportPredictionTab({ onDispatchGroup }: { onDispatchGroup: (group: AssignedGroup) => void }) {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<"unassigned" | "assigned">("unassigned");
  const [showFlyout, setShowFlyout] = useState(false);

  // Assign dialog state
  const [assignGroup, setAssignGroup] = useState<UnassignedGroup | null>(null);
  const [assignCarrier, setAssignCarrier] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery<PredictData>({
    queryKey: ["/api/transport/predict"],
    staleTime: 60000,
  });

  const carriers = data?.carriers ?? [];
  const unassigned = data?.unassigned ?? [];
  const assigned = data?.assigned ?? [];

  const assignMutation = useMutation({
    mutationFn: ({ orderIds, dispatchBy }: { orderIds: string[]; dispatchBy: string }) =>
      apiRequest("PATCH", "/api/transport/assign", { orderIds, dispatchBy }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/predict"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: `Assigned "${vars.dispatchBy}" to ${vars.orderIds.length} order(s)` });
      setAssignGroup(null);
      setAssignCarrier("");
    },
    onError: (e: Error) => toast({ title: "Failed to assign", description: e.message, variant: "destructive" }),
  });

  // Get carrier name options for assign dialog (carrier names + custom input)
  const carrierNames = carriers.map(c => c.name);

  const totalUnassignedOrders = unassigned.reduce((s, g) => s + g.orderCount, 0);
  const totalAssignedOrders = assigned.reduce((s, g) => s + g.orderCount, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Transport tab header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setSubTab("unassigned")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${subTab === "unassigned" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="tab-transport-unassigned"
            >
              Unassigned
              {totalUnassignedOrders > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0 min-w-5 h-4">
                  {totalUnassignedOrders}
                </Badge>
              )}
            </button>
            <button
              onClick={() => setSubTab("assigned")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${subTab === "assigned" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="tab-transport-assigned"
            >
              Assigned
              {totalAssignedOrders > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0 min-w-5 h-4">
                  {totalAssignedOrders}
                </Badge>
              )}
            </button>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()} disabled={isFetching} title="Refresh">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowFlyout(true)} className="gap-1.5" data-testid="button-manage-transport">
          <Settings className="w-4 h-4" />
          Manage Transport
        </Button>
      </div>

      {/* ── Unassigned sub-tab ── */}
      {subTab === "unassigned" && (
        <div>
          {unassigned.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Truck className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">No unassigned invoiced orders</p>
              <p className="text-sm mt-1">All invoiced orders already have a carrier assigned.</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-2 font-medium">Party</th>
                      <th className="text-center p-2 font-medium">Orders</th>
                      <th className="text-center p-2 font-medium">Cases</th>
                      <th className="text-left p-2 font-medium hidden md:table-cell">Case Sizes</th>
                      {carriers.map(c => (
                        <th key={c.id} className="text-right p-2 font-medium whitespace-nowrap hidden lg:table-cell">
                          {c.name}
                        </th>
                      ))}
                      <th className="text-right p-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {unassigned.map(group => (
                      <tr key={group.partyName} className="hover:bg-muted/30 transition-colors">
                        <td className="p-2">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="font-medium max-w-[180px] truncate">{group.partyName}</span>
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <Badge variant="outline">{group.orderCount}</Badge>
                        </td>
                        <td className="p-2 text-center">
                          <span className={group.totalCases === 0 ? "text-muted-foreground" : "font-medium"}>
                            {group.totalCases || "-"}
                          </span>
                        </td>
                        <td className="p-2 hidden md:table-cell">
                          {group.caseSizes.length > 0 ? (
                            <div className="flex gap-1 flex-wrap">
                              {group.caseSizes.map(cs => (
                                <Badge key={cs} variant="secondary" className="text-xs px-1.5 py-0">
                                  <BoxesIcon className="w-2.5 h-2.5 mr-0.5" />{cs}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </td>
                        {carriers.map(c => {
                          const cost = group.carrierCosts[c.id];
                          return (
                            <td key={c.id} className="p-2 text-right hidden lg:table-cell">
                              {cost?.matched ? (
                                <div>
                                  {cost.estimatedCost !== null ? (
                                    <span className="font-medium text-green-700 dark:text-green-400">{formatINR(cost.estimatedCost)}</span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">
                                      {formatINR(cost.minRate)}-{formatINR(cost.maxRate)}
                                      <span className="block text-muted-foreground">×{group.orderCount}</span>
                                    </span>
                                  )}
                                  {cost.location && (
                                    <div className="text-xs text-muted-foreground truncate max-w-[120px]">{cost.location}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">No rate</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-7 text-xs"
                            onClick={() => {
                              setAssignGroup(group);
                              setAssignCarrier(carriers[0]?.name ?? "");
                            }}
                            data-testid={`button-assign-${group.partyName}`}
                          >
                            <Truck className="w-3 h-3" />
                            Assign
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Assigned sub-tab ── */}
      {subTab === "assigned" && (
        <div>
          {assigned.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">No assigned invoiced orders</p>
              <p className="text-sm mt-1">Assign carriers to invoiced orders using the Unassigned tab.</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-2 font-medium">Carrier / Dispatch By</th>
                      <th className="text-center p-2 font-medium">Orders</th>
                      <th className="text-center p-2 font-medium">Total Cases</th>
                      <th className="text-right p-2 font-medium">Est. Cost</th>
                      <th className="text-right p-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {assigned.map(group => (
                      <tr key={group.dispatchBy} className="hover:bg-muted/30 transition-colors">
                        <td className="p-2">
                          <div className="flex items-center gap-1.5">
                            <Truck className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                            <span className="font-medium">{group.dispatchBy}</span>
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <Badge variant="outline">{group.orderCount}</Badge>
                        </td>
                        <td className="p-2 text-center">
                          <span className={group.totalCases === 0 ? "text-muted-foreground" : "font-medium"}>
                            {group.totalCases || "-"}
                          </span>
                        </td>
                        <td className="p-2 text-right">
                          {group.estimatedCost !== null ? (
                            <span className="font-semibold text-green-700 dark:text-green-400">
                              {formatINR(group.estimatedCost)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          <Button
                            size="sm"
                            className="gap-1 h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                            onClick={() => onDispatchGroup(group)}
                            data-testid={`button-dispatch-${group.dispatchBy}`}
                          >
                            <ChevronRight className="w-3 h-3" />
                            Dispatch All
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assign Dialog */}
      <Dialog open={!!assignGroup} onOpenChange={v => !v && setAssignGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Transport Carrier</DialogTitle>
            <DialogDescription>
              Assign a carrier for <strong>{assignGroup?.partyName}</strong> ({assignGroup?.orderCount} order{assignGroup?.orderCount !== 1 ? "s" : ""})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Carrier / Dispatch By</Label>
              <Select value={assignCarrier} onValueChange={setAssignCarrier}>
                <SelectTrigger>
                  <SelectValue placeholder="Select or type carrier name" />
                </SelectTrigger>
                <SelectContent>
                  {carrierNames.map(n => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="mt-2"
                placeholder="Or type custom carrier name..."
                value={assignCarrier}
                onChange={e => setAssignCarrier(e.target.value)}
              />
            </div>

            {/* Cost preview */}
            {assignGroup && assignCarrier && (
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Cost Estimate</p>
                {(() => {
                  const carrier = carriers.find(c => c.name === assignCarrier);
                  if (!carrier) return <p className="text-muted-foreground">No rate data available for custom carrier</p>;
                  const cost = assignGroup.carrierCosts[carrier.id];
                  if (!cost) return <p className="text-muted-foreground">No rate data</p>;
                  if (cost.estimatedCost !== null) {
                    return (
                      <div className="flex justify-between">
                        <span>{carrier.type === "flat_per_location" ? "Flat rate" : `${assignGroup.orderCount} orders × rate`}</span>
                        <span className="font-semibold text-green-700 dark:text-green-400">{formatINR(cost.estimatedCost)}</span>
                      </div>
                    );
                  }
                  if (cost.minRate && cost.maxRate) {
                    return (
                      <div className="flex justify-between">
                        <span>Est. ({assignGroup.orderCount} orders × rate)</span>
                        <span className="font-semibold">{formatINR(Number(cost.minRate) * assignGroup.orderCount)} – {formatINR(Number(cost.maxRate) * assignGroup.orderCount)}</span>
                      </div>
                    );
                  }
                  return <p className="text-muted-foreground">No matching rate found</p>;
                })()}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAssignGroup(null)}>Cancel</Button>
              <Button
                disabled={!assignCarrier || assignMutation.isPending}
                onClick={() => assignGroup && assignMutation.mutate({ orderIds: assignGroup.orderIds, dispatchBy: assignCarrier })}
              >
                {assignMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Assign to {assignGroup?.orderCount} order{assignGroup?.orderCount !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transport Management Flyout */}
      <TransportFlyout open={showFlyout} onClose={() => setShowFlyout(false)} />
    </div>
  );
}
