import { useState } from 'react';
import { useGetAuthorizationAuditLogs, AuthorizationAuditLog } from '@workspace/api-client-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Search, Eye, History, User, Lock } from 'lucide-react';
import { format } from 'date-fns';

export function AuditTab() {
  const [resource, setResource] = useState('');
  const [resourceId, setResourceId] = useState('');
  
  const [filters, setFilters] = useState({ resource: '', resourceId: '' });
  
  const { data: logs, isLoading } = useGetAuthorizationAuditLogs({
    resource: filters.resource || undefined,
    resourceId: filters.resourceId || undefined
  });

  const [selectedLog, setSelectedLog] = useState<AuthorizationAuditLog | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ resource, resourceId });
  };

  const safeParseJSON = (str: string | null) => {
    if (!str) return 'null';
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch (e) {
      return str;
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 border border-border rounded-lg bg-card shadow-sm flex flex-col sm:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex-1 flex flex-col sm:flex-row gap-4">
          <div className="space-y-1 flex-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Resource</label>
            <Input 
              placeholder="e.g. ROLE_BINDING" 
              value={resource}
              onChange={(e) => setResource(e.target.value)}
              className="font-mono text-sm"
              data-testid="input-audit-resource"
            />
          </div>
          <div className="space-y-1 flex-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Resource ID</label>
            <Input 
              placeholder="Target ID" 
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              className="font-mono text-sm"
              data-testid="input-audit-resourceid"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" data-testid="button-search-audit">
              <Search className="size-4 mr-2" /> Filter Logs
            </Button>
          </div>
        </form>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground ml-1">
        <Lock className="size-3" />
        Audit records are immutable and appended securely by the foundation platform.
      </div>

      <div className="border border-border rounded-lg bg-card overflow-hidden h-[600px] flex flex-col">
        <div className="p-3 border-b border-border bg-muted/20 grid grid-cols-12 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <div className="col-span-2">Time</div>
          <div className="col-span-2">Actor</div>
          <div className="col-span-2">Action</div>
          <div className="col-span-3">Resource</div>
          <div className="col-span-2">Decision</div>
          <div className="col-span-1 text-right">Details</div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="divide-y divide-border">
            {isLoading ? (
              Array(10).fill(0).map((_, i) => (
                <div key={i} className="p-4"><Skeleton className="h-6 w-full" /></div>
              ))
            ) : logs?.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <History className="size-10 mx-auto mb-3 opacity-20" />
                <p>No audit records found.</p>
              </div>
            ) : (
              logs?.map(log => (
                <div key={log.id} className="p-3 grid grid-cols-12 gap-4 items-center hover:bg-muted/10 transition-colors text-sm" data-testid={`row-audit-${log.id}`}>
                  <div className="col-span-2 text-xs text-muted-foreground">
                    {format(new Date(log.createdAt), 'MMM d, HH:mm:ss')}
                  </div>
                  <div className="col-span-2 flex items-center gap-2 truncate">
                    <User className="size-3 opacity-50" />
                    <span className="truncate font-mono text-xs">{log.actorUserId || 'SYSTEM'}</span>
                  </div>
                  <div className="col-span-2 font-mono text-xs">{log.action}</div>
                  <div className="col-span-3">
                    <div className="font-medium text-xs">{log.resource}</div>
                    <div className="text-[10px] text-muted-foreground truncate font-mono mt-0.5">{log.resourceId}</div>
                  </div>
                  <div className="col-span-2">
                    <Badge variant={log.decision === 'ALLOW' ? 'default' : 'destructive'} className="text-[10px] h-5">
                      {log.decision}
                    </Badge>
                  </div>
                  <div className="col-span-1 text-right">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedLog(log)} data-testid={`button-audit-details-${log.id}`}>
                      <Eye className="size-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5 text-primary" />
              Audit Record Details
            </DialogTitle>
            <DialogDescription>
              Record ID: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{selectedLog?.id}</code>
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/20 p-4 rounded-lg border border-border">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Action</div>
                  <div className="font-mono text-sm">{selectedLog.action}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Decision</div>
                  <Badge variant={selectedLog.decision === 'ALLOW' ? 'default' : 'destructive'}>
                    {selectedLog.decision}
                  </Badge>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Reason Code</div>
                  <div className="font-mono text-xs">{selectedLog.reasonCode}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Timestamp</div>
                  <div className="text-sm">{format(new Date(selectedLog.createdAt), 'PP pp')}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3 border border-border rounded-lg p-4">
                  <h4 className="font-semibold text-sm border-b border-border pb-2">Context</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Actor ID:</span>
                      <span className="font-mono text-xs">{selectedLog.actorUserId || 'SYSTEM'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Org ID:</span>
                      <span className="font-mono text-xs">{selectedLog.organizationId || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Scope Eval:</span>
                      <span className="font-mono text-xs">{selectedLog.scopeEvaluated || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Request ID:</span>
                      <span className="font-mono text-xs">{selectedLog.requestId || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 border border-border rounded-lg p-4">
                  <h4 className="font-semibold text-sm border-b border-border pb-2">Resource Target</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <span className="font-mono text-xs">{selectedLog.resource}</span>
                    </div>
                    <div className="flex justify-between flex-col gap-1">
                      <span className="text-muted-foreground">ID:</span>
                      <span className="font-mono text-xs bg-muted/50 p-1 rounded break-all">{selectedLog.resourceId || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {(selectedLog.beforeState || selectedLog.afterState) && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm">State Changes</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-border rounded-md overflow-hidden flex flex-col">
                      <div className="bg-muted/30 p-2 text-xs font-medium border-b border-border">Before State</div>
                      <ScrollArea className="h-40 bg-black/5 dark:bg-black/20 p-3">
                        <pre className="text-[10px] font-mono whitespace-pre-wrap">
                          {safeParseJSON(selectedLog.beforeState)}
                        </pre>
                      </ScrollArea>
                    </div>
                    <div className="border border-border rounded-md overflow-hidden flex flex-col">
                      <div className="bg-muted/30 p-2 text-xs font-medium border-b border-border">After State</div>
                      <ScrollArea className="h-40 bg-black/5 dark:bg-black/20 p-3">
                        <pre className="text-[10px] font-mono whitespace-pre-wrap">
                          {safeParseJSON(selectedLog.afterState)}
                        </pre>
                      </ScrollArea>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
