import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Package, FileText, MessageCircle, ShoppingCart, ArrowRight, Phone, ExternalLink } from "lucide-react";
import { Link } from "wouter";

function getDevUrl(): string | null {
  const hostname = window.location.hostname;
  if (hostname.endsWith(".repl.co")) {
    return `https://${hostname.replace(".repl.co", ".replit.dev")}`;
  }
  return null;
}

function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function handleLogin(e: React.MouseEvent) {
  if (isInIframe()) {
    e.preventDefault();
    const devUrl = getDevUrl();
    if (devUrl) {
      window.open(devUrl, "_blank");
    } else {
      window.open("/api/login", "_blank");
    }
  }
}

export default function Landing() {
  const inIframe = isInIframe();
  const devUrl = getDevUrl();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-background sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 h-16 max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            <h1 className="font-semibold text-lg">Order Entry</h1>
          </div>
          <Button asChild data-testid="button-login">
            <a href="/api/login" onClick={handleLogin}>Log In</a>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center">
        <section className="py-16 px-4">
          <div className="max-w-md mx-auto text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Package className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-3xl font-bold mb-4">
              Order Entry
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Log in to browse products, create orders, and send them via WhatsApp or email.
            </p>

            {inIframe && devUrl && (
              <Card className="p-4 mb-6">
                <p className="text-sm text-muted-foreground mb-3">
                  Google login requires opening the app in a new tab.
                </p>
                <Button size="lg" className="w-full" asChild data-testid="button-open-new-tab">
                  <a href={devUrl} target="_blank" rel="noopener noreferrer">
                    Open App in New Tab
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </a>
                </Button>
              </Card>
            )}

            <div className="flex flex-col gap-3">
              {!inIframe && (
                <Button size="lg" asChild data-testid="button-get-started">
                  <a href="/api/login">
                    Log In with Google
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </a>
                </Button>
              )}
              <Button size="lg" variant="outline" asChild data-testid="button-phone-login">
                <Link href="/phone-login">
                  <Phone className="w-5 h-5 mr-2" />
                  Log In with Phone
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 px-4">
        <div className="max-w-6xl mx-auto text-center text-sm text-muted-foreground">
          <p>Order Entry App</p>
        </div>
      </footer>
    </div>
  );
}
