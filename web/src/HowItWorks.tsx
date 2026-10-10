import { Icon } from "./components";

export function HowItWorks() {
  return (
    <div className="how-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LOOP THAT BUILDS</span>
          <h1 className="chrome-text">How Keel works.</h1>
          <p>Trade. Fund a basket. Ship the next build.</p>
        </div>
      </div>
      <div className="how-loop card">
        <span>
          <Icon name="cube" size={28} />
          <strong>Trade</strong>
          <small>1% IMD fee</small>
        </span>
        <Icon name="arrow" />
        <span>
          <Icon name="bars" size={28} />
          <strong>Fund</strong>
          <small>A project basket</small>
        </span>
        <Icon name="arrow" />
        <span>
          <Icon name="code" size={28} />
          <strong>Build</strong>
          <small>Verified on IMD</small>
        </span>
      </div>
      <div className="how-grid">
        <article className="how-card card">
          <span className="eyebrow">01 / LAUNCH</span>
          <h2>A project gets a market.</h2>
          <p>
            A real IMD job and a signed launch permit open the gate. Each
            creator can have one building token at a time.
          </p>
          <p>
            The token supply seeds a TOKEN/IMD pool. Liquidity is
            permanently locked.
          </p>
        </article>
        <article className="how-card card">
          <span className="eyebrow">02 / FEES</span>
          <h2>A little from every trade.</h2>
          <p>Every trade through a Keel pool pays a 1% fee in IMD.</p>
          <div className="how-split">
            <div>
              <strong className="mono">10%</strong>
              <span>Team</span>
            </div>
            <div>
              <strong className="mono">0–80%</strong>
              <span>Creator</span>
            </div>
            <div>
              <strong className="mono">Rest</strong>
              <span>Basket</span>
            </div>
          </div>
          <p>
            The creator chooses their share at launch and can only lower it. If
            inactive, their share goes to the basket. After close, 10% goes to
            the team and 90% to the creator.
          </p>
        </article>
        <article className="how-card card">
          <span className="eyebrow">03 / BUILD</span>
          <h2>The basket pays for progress.</h2>
          <p>
            The creator pays for each continuation on IMD. After a verifier
            confirms the finished job, the basket repays the real price, up to
            the run price and available basket.
          </p>
          <p>
            A run can also be recorded with no repayment. Each verified run adds
            1 to the build pulse; it halves every 7 days. A full bar is 20.
            Below 0.5 is Quiet.
          </p>
        </article>
        <article className="how-card card">
          <span className="eyebrow">04 / CLOSE</span>
          <h2>A notice. Then a close.</h2>
          <p>
            Only the team can close a project: at least 7 days after announcing
            it, and at least 30 days after launch. The team can cancel the
            notice.
          </p>
          <p>
            The remaining basket is fixed at close. The token and its locked
            pool keep trading.
          </p>
        </article>
        <article className="how-card card claim-explanation">
          <span className="eyebrow">05 / CLAIM</span>
          <h2>Hold through the notice.</h2>
          <p>
            Your claim uses the smaller of your balances at the two snapshots:
            just before the close was announced, and just before the close.
            Selling or transferring during the notice gives up that share.
          </p>
          <p>
            Buying after the notice brings no claim rights. Transferring after
            close does not transfer the claim. Each eligible wallet claims once.
            Rounding leftovers, forfeited shares and unclaimed amounts stay in
            the contract.
          </p>
          <div className="notice">
            <Icon name="info" />
            <span>
              Creator text and images are unverified. Keel is not operated by
              IMD.
            </span>
          </div>
        </article>
      </div>
      <div className="how-actions">
        <a href="#/market" className="button primary">
          Explore market <Icon name="arrow" />
        </a>
        <a href="#/island" className="button ghost">
          Walk the island
        </a>
      </div>
    </div>
  );
}
