import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Package, Upload, MessageCircle, Mail, ArrowRight } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-background sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 h-16 max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            <h1 className="font-semibold text-lg">Order Entry</h1>
          </div>
          <Button asChild data-testid="button-login">
            <a href="/api/login">Log In</a>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="py-16 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Streamline Your Order Process
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Upload your product inventory, create orders on the go, and send them instantly via WhatsApp or email.
            </p>
            <Button size="lg" asChild data-testid="button-get-started">
              <a href="/api/login">
                Get Started
                <ArrowRight className="w-5 h-5 ml-2" />
              </a>
            </Button>
          </div>
        </section>

        <section className="py-16 px-4 bg-muted/30">
          <div className="max-w-5xl mx-auto">
            <h3 className="text-2xl font-semibold text-center mb-12">How It Works</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-7 h-7 text-primary" />
                </div>
                <h4 className="font-semibold mb-2">Upload Your SKU List</h4>
                <p className="text-sm text-muted-foreground">
                  Import your product inventory from Excel or CSV files. Each user gets their own product catalog.
                </p>
              </Card>
              
              <Card className="p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Package className="w-7 h-7 text-primary" />
                </div>
                <h4 className="font-semibold mb-2">Build Your Order</h4>
                <p className="text-sm text-muted-foreground">
                  Search and select products, add quantities, and watch your order total update in real-time.
                </p>
              </Card>
              
              <Card className="p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-7 h-7 text-primary" />
                </div>
                <h4 className="font-semibold mb-2">Send Instantly</h4>
                <p className="text-sm text-muted-foreground">
                  Share your order via WhatsApp message or email the spreadsheet directly to your supplier.
                </p>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-16 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h3 className="text-2xl font-semibold mb-4">Ready to Get Started?</h3>
            <p className="text-muted-foreground mb-6">
              Log in to upload your product catalog and start creating orders.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button size="lg" asChild>
                <a href="/api/login">
                  <MessageCircle className="w-5 h-5 mr-2" />
                  Start Ordering
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 px-4">
        <div className="max-w-6xl mx-auto text-center text-sm text-muted-foreground">
          <p>Order Entry App - Manage orders from anywhere</p>
        </div>
      </footer>
    </div>
  );
}
