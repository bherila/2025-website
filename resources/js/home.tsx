import './bootstrap';

import React from 'react';
import { createRoot } from 'react-dom/client';

import { CTAs } from '@/components/ctas';
import CustomLink from '@/components/link';
import MainTitle from '@/components/MainTitle';

// Define Line component outside of render
const Line = ({ children }: { children: React.ReactNode }) => <p className="py-2">{children}</p>

function Home() {
  const Im = <>I&rsquo;m</>
  return (
    <div className="max-w-2xl mx-auto">
      <MainTitle>Hi, {Im} Ben</MainTitle>

      <Line>{Im} currently:</Line>
      <ul className="list-disc list-inside pl-4">
        <li>
          a Tech Lead at Meta, where I support the Getting Together teams. We build product 
          and infrastructure (like Online Status) that help billions of people find and
          connect across platforms like Instagram, Facebook, and{' '}
          <CustomLink href="https://horizon.meta.com" rel="noopener">
            Meta Horizon
          </CustomLink>.
        </li>
        <li>
          a venture partner at{' '}
          <CustomLink href="https://www.pioneerfund.vc/team" rel="noopener">
            Pioneer Fund
          </CustomLink>
          , a pre-seed fund that invests in early-stage{' '}
          <CustomLink href="https://www.ycombinator.com" rel="noopener">
            YC
          </CustomLink>{' '}
          startups.
        </li>
      </ul>

      <Line>
        Before Meta, I worked at Airbnb on the internationalization team. We 
        expanded Airbnb.com to 32+ new countries, added right-to-left support 
        and 4‑byte Unicode handling, and more. You can read about it on the{' '}
        <CustomLink
          href="https://medium.com/airbnb-engineering/building-airbnbs-internationalization-platform-45cf0104b63c"
          rel="noopener"
        >
          Airbnb engineering blog
        </CustomLink>
        .
      </Line>

      <Line>
        Before Airbnb, I co-founded and served as CTO of{' '}
        <CustomLink href="https://www.undergroundcellar.com">Underground Cellar</CustomLink>, 
        an e-commerce company backed by Bling Capital and Y Combinator (Winter 2015).
      </Line>

      <Line>
        I began my professional career at Microsoft, working briefly on the Office Graphics platform in 2009. Through my work on MinWin I helped make Windows Server smaller; read more via the archived{' '}
        <CustomLink
          href="https://web.archive.org/web/20240806233349/https://servercore.net/2013/07/meet-the-new-server-core-program-manager/"
          rel="noopener"
        >
          Server Core post
        </CustomLink>
        .
      </Line>

      <Line>
        Earlier on, I built online presences and digital products for a variety of companies, including{' '}
        <CustomLink href="/projects/roessner/" rel="noopener">
          Roessner &amp; Co.
        </CustomLink>
        ,{' '}
        <CustomLink href="/projects/walsh/" rel="noopener">
          The Walsh Company
        </CustomLink>
        , and{' '}
        <CustomLink href="/projects/marisol/" rel="noopener">
          Marisol
        </CustomLink>
        . See more on the{' '}
        <CustomLink href="/projects/">projects page</CustomLink>.
      </Line>
      <CTAs />
    </div>
  )
}

const homeElement = document.getElementById('home');
if (homeElement) {
  createRoot(homeElement).render(<Home />);
}
