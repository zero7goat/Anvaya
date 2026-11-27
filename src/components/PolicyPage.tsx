import { Fragment, ReactNode, useEffect } from "react";
import { BOUTIQUE_CONFIG } from "../config";
import { POLICY_LINKS, type PolicyView } from "../utils/routes";
import { FloralSprig } from "./decor/Motifs";
import { DomeBorder } from "./AuthFormParts";
import Reveal from "./Reveal";
import { smoothScroll } from "../utils/smoothScroll";

const LAST_UPDATED = "27 November 2026";

// Anchor id for a section heading, e.g. "Delivery, cancellation and returns" -> "delivery-cancellation-and-returns"
const sectionId = (heading: string) => heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const { brandName, supportEmail, supportPhone, supportHours, storeLocation, whatsappNumber, anvayaOwner, alankrithaOwner } = BOUTIQUE_CONFIG;

const EmailLink = () => (
  <a href={`mailto:${supportEmail}`} className="link">
    {supportEmail}
  </a>
);
const WhatsAppLink = () => (
  <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="link">
    WhatsApp
  </a>
);

type Section = { heading: string; body: ReactNode };

const POLICIES: Record<PolicyView, { title: string; intro: string; sections: Section[] }> = {
  policy_shipping: {
    title: "Shipping & Returns",
    intro: "How ordering, delivery, cancellation and returns work at ANVAYA.",
    sections: [
      {
        heading: "Ordering and payment",
        body: (
          <>
            <p>
              Pay online at checkout with UPI, a debit or credit card, or net banking. Payments are processed securely by
              Razorpay, and your order is confirmed once payment is received.
            </p>
            <p>
              You can also send your bag to us on <WhatsAppLink />. We confirm availability and the final amount in the chat,
              then share how to pay. Cash on Delivery is not available at the moment.
            </p>
          </>
        ),
      },
      {
        heading: "Delivery",
        body: (
          <>
            <p>We deliver across India, and shipping is free.</p>
            <p>Orders are usually dispatched within 3 to 5 working days of confirmation and arrive within 3 to 7 working days after dispatch. Times can vary by location, and we will update you on WhatsApp.</p>
          </>
        ),
      },
      {
        heading: "Cancellation",
        body: (
          <p>
            You can cancel an order only before it is dispatched, by messaging us on <WhatsAppLink /> or emailing <EmailLink />.
            Once dispatched, an order can't be cancelled. If you have already paid and cancel before dispatch, we refund the
            amount paid.
          </p>
        ),
      },
      {
        heading: "Refunds",
        body: (
          <>
            <p>Money is refunded only before an order is dispatched: when you cancel a paid order before dispatch, or when we can't fulfil it, for example because a piece is out of stock.</p>
            <p>Once an order has been dispatched, it is not refunded. A piece that arrives damaged is replaced as described under Returns.</p>
          </>
        ),
      },
      {
        heading: "Returns",
        body: (
          <>
            <p>We accept a return only when all of these are true:</p>
            <ul>
              <li>The piece arrived damaged.</li>
              <li>You have a clear, uncut video of opening the parcel, showing the damage.</li>
              <li>The piece has not been worn, washed or altered, and its tags and packaging are intact.</li>
              <li>You contact us within 48 hours of delivery with your name, order details and the video.</li>
            </ul>
            <p>Once we approve a return, we tell you how to send the piece back and cover the return shipping. We then replace it, or offer another piece of the same value if it is no longer available.</p>
            <p>We can't accept returns or exchanges for a change of mind or a wrong size, so please check sizes before ordering. Small variations in colour and finish are natural in handcrafted pieces and are not damage.</p>
          </>
        ),
      },
    ],
  },
  policy_terms: {
    title: "Terms & Conditions",
    intro: "These terms apply when you use this website or order from ANVAYA.",
    sections: [
      {
        heading: "About us",
        body: (
          <p>
            {brandName} is a collaboration based in {storeLocation}. {brandName} is owned by {anvayaOwner}, and the Alankritha
            collection is owned by {alankrithaOwner}.
          </p>
        ),
      },
      {
        heading: "Products",
        body: <p>We describe our pieces as accurately as we can. Colours may look slightly different on screens, and small variations are natural in handcrafted work. Stock is limited.</p>,
      },
      {
        heading: "Prices",
        body: <p>Prices are in Indian Rupees. The total shown at checkout, or the amount we confirm on WhatsApp, is the amount you pay.</p>,
      },
      {
        heading: "Orders",
        body: (
          <>
            <p>When you check out online, the pieces are held for you while you pay, and your order is placed once the payment goes through.</p>
            <p>Sending us a bag on WhatsApp is an enquiry. It does not reserve stock, and that order is confirmed only when we have confirmed availability and received payment.</p>
            <p>We may decline an order if a piece is unavailable, details are incorrect, or delivery isn't possible. If we decline an order you have paid for, we refund the amount paid.</p>
          </>
        ),
      },
      {
        heading: "Coupons",
        body: <p>Coupons, when offered, have their own conditions and may be changed or withdrawn. Only one coupon can be used per order.</p>,
      },
      {
        heading: "Delivery, cancellation and returns",
        body: (
          <p>
            These are covered by our{" "}
            <a href="/shipping-and-returns" className="link">
              Shipping &amp; Returns policy
            </a>
            .
          </p>
        ),
      },
      {
        heading: "Website content",
        body: <p>The content, photos and brand names on this site belong to {brandName} or are used with permission. Please don't copy them without our written consent.</p>,
      },
      {
        heading: "Complaints",
        body: (
          <p>
            For any complaint, contact {anvayaOwner} at <EmailLink /> or {supportPhone}, {supportHours}. We aim to acknowledge
            complaints within 48 hours and resolve them within 30 days.
          </p>
        ),
      },
      {
        heading: "Governing law",
        body: <p>These terms follow the laws of India. Any dispute falls under the courts of Ballari, Karnataka.</p>,
      },
    ],
  },
  policy_privacy: {
    title: "Privacy Policy",
    intro: "What information ANVAYA handles, why, and the choices you have.",
    sections: [
      {
        heading: "What we collect",
        body: (
          <>
            <p>This website has no customer accounts. When you check out, you give us your name, phone number, email address (optional) and delivery address, which are saved with your order.</p>
            <p>When you order on WhatsApp or email us, we receive what you share, such as your name, phone number, delivery address and order details.</p>
          </>
        ),
      },
      {
        heading: "Why we use it",
        body: <p>To confirm, deliver and support your order, to contact you about it, and to keep business and tax records.</p>,
      },
      {
        heading: "Your location (optional)",
        body: (
          <>
            <p>At checkout you can let the website use your location to fill in your PIN code, city and state. Your browser asks for permission first, and you can say no and type your address instead.</p>
            <p>If you allow it, your position is sent to OpenStreetMap's address service to find the address. We don't store your location.</p>
            <p>When you type a PIN code, it is checked with India Post's public PIN code service to fill in your city and state.</p>
          </>
        ),
      },
      {
        heading: "Stored on your device",
        body: <p>Your bag, an applied coupon code, recent searches, recently viewed pieces and, if you choose, your delivery details for next time are saved in your own browser so they are there when you return. They reach us only when you place an order or send them on WhatsApp.</p>,
      },
      {
        heading: "Payment",
        body: <p>Online payments are processed by Razorpay. Your card, UPI or bank details are entered in Razorpay's secure payment window and never reach us; we receive only the payment confirmation.</p>,
      },
      {
        heading: "Who handles your information",
        body: <p>WhatsApp handles your messages under its own terms, and Razorpay handles online payments under its own terms. We share your name, phone number and address with our courier for delivery. The site is hosted by Cloudflare, and its product information and orders are stored with Supabase. We don't sell your information.</p>,
      },
      {
        heading: "How long we keep it",
        body: <p>We keep order details for as long as needed for orders, disputes and legal or tax requirements, then delete or anonymise them.</p>,
      },
      {
        heading: "Your choices",
        body: (
          <p>
            You can ask to see, correct or delete your information, subject to records we must keep. Contact {anvayaOwner} at{" "}
            <EmailLink />.
          </p>
        ),
      },
      {
        heading: "Changes",
        body: <p>We will update this page if this policy changes.</p>,
      },
    ],
  },
};

interface PolicyPageProps {
  view: PolicyView;
  onNavigate: (view: PolicyView) => void;
}

/**
 * Shipping & Returns, Terms & Conditions and Privacy Policy, in the storefront's look:
 * floral sprigs at the edges, serif headings on the cream page and the scalloped border.
 */
export default function PolicyPage({ view, onNavigate }: PolicyPageProps) {
  const policy = POLICIES[view];

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${policy.title} | ${brandName}`;
    return () => {
      document.title = previousTitle;
    };
  }, [policy.title]);

  return (
    <div className="relative isolate overflow-hidden bg-canvas pb-20" id="policy-page">
      <FloralSprig className="absolute left-0 top-24 h-48 md:h-[26rem] w-auto text-line-strong opacity-50 md:opacity-100 -z-10" />
      <FloralSprig className="absolute right-0 bottom-24 h-48 md:h-[26rem] w-auto text-line-strong -scale-x-100 opacity-50 md:opacity-100 -z-10" />

      <div className="max-w-2xl mx-auto px-4 pt-10 sm:pt-14">
        <header className="text-center">
          <p className="eyebrow mb-3">{brandName}</p>
          <h1 className="font-serif text-3xl sm:text-4xl text-ink">{policy.title}</h1>
          <p className="text-body mt-3">{policy.intro}</p>
          <p className="text-xs text-muted mt-2">Last updated {LAST_UPDATED}</p>
        </header>

        <nav aria-label="Policies" className="mt-8 flex flex-wrap justify-center gap-2">
          {POLICY_LINKS.map((link) => (
            <button
              key={link.view}
              type="button"
              onClick={() => onNavigate(link.view)}
              aria-current={link.view === view ? "page" : undefined}
              className={`btn btn-sm ${link.view === view ? "btn-primary" : "btn-secondary"}`}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Contents: jump to a section */}
        {policy.sections.length > 2 && (
          <nav aria-label="On this page" className="mt-8 panel p-5">
            <p className="eyebrow text-ink mb-3">On this page</p>
            <ol className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm list-decimal pl-5 marker:text-muted">
              {policy.sections.map(({ heading }) => (
                <li key={heading}>
                  <a
                    href={`#${sectionId(heading)}`}
                    onClick={(e) => {
                      e.preventDefault();
                      smoothScroll.scrollToElement(document.getElementById(sectionId(heading)));
                    }}
                    className="link"
                  >
                    {heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className="mt-10 space-y-8">
          {policy.sections.map(({ heading, body }) => (
            <Fragment key={heading}>
            <Reveal y={16}>
              <section id={sectionId(heading)} className="border-t border-line pt-6 scroll-mt-28">
                <h2 className="font-serif text-xl text-ink mb-3">{heading}</h2>
                <div className="text-sm text-ink/85 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">{body}</div>
              </section>
            </Reveal>
            </Fragment>
          ))}
        </div>

        <aside className="mt-10 panel p-5 text-center text-sm text-ink/85 leading-relaxed">
          Questions? Message us on <WhatsAppLink /> at {supportPhone}, {supportHours}, or email <EmailLink />.
        </aside>
      </div>

      <DomeBorder patternId="policy-domes" />
    </div>
  );
}
