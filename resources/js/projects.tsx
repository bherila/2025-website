import React from 'react';
import ReactDOM from 'react-dom/client';
import Container from '@/components/container';
import MainTitle from '@/components/MainTitle';
import ImageAndText from '@/components/image-and-text';
import CustomLink from '@/components/link';
import { CTAs } from '@/components/ctas';

const ProjectsPage: React.FC = () => {
  return (
    <Container>
      <div className="max-w-2xl mx-auto py-8">
        <MainTitle className="mb-4">Selected Projects</MainTitle>
        <ImageAndText
          extraClass=""
          imageUrl="/images/avocado-toast.jpg"
          alt="Avocado toast"
          ctaLink="/recipes"
          ctaText="See Recipes"
          title="Cooking"
        >
          <p className="py-2">
            I like to cook, a lot. Lately, I&apos;ve focused mostly on Asian cuisine. However, I also love european cuisine,
            especially my own heritage, Italian, cooking, and French. Since friends have asked, I&apos;m posting some
            recipes and cooking tips online.
          </p>
        </ImageAndText>
        <ImageAndText
          extraClass=""
          imageUrl="/images/underground-cellar-2-min.png"
          alt="Underground Cellar Screenshot"
          title="Underground Cellar"
        >
          <p className="py-2">
            As co-founder and CTO at Underground Cellar, I grew the engineering team and own the internal products used by
            the company, spanning frontend, backend, administrative interface, and mobile apps for iOS and Android
            platforms. I also work with the CEO and major investors to design and implement financial models and reports. As
            a board director, I worked with investors and shape the governance of the company.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Custom e-commerce backend</li>
            <li>Y Combinator backed, Winter 2015</li>
            <li>Winner of LAUNCH Festival, Best Consumer Startup</li>
          </ul>
          <CustomLink href="https://www.undergroundcellar.com" rel="noopener" className="mt-2 block">
            Visit Underground Cellar
          </CustomLink>
        </ImageAndText>
        <ImageAndText
          extraClass=""
          imageUrl="/images/nom-3-min.png"
          alt="NOM Website Screenshot"
          ctaLink="https://www.thisisnom.co"
          ctaText="Visit Not Ordinary Media (NOM)"
          title="Not Ordinary Media (NOM)"
          date="Winter 2019"
        >
          <p className="py-2">
            Design-first website for a modern media company. Featuring landing pages with custom Salesforce integration.
            Runs on Webflow.
          </p>
        </ImageAndText>
        <ImageAndText
          extraClass=""
          imageUrl="/images/coh1-min.png"
          alt="Christ Our Hope Catholic Church Website Screenshot"
          ctaLink="https://www.christourhopeseattle.org"
          ctaText="Visit Christ Our Hope Catholic Church"
          title="Christ Our Hope Catholic Church"
          date="Winter 2015"
        >
          <p className="py-2">
            Website build-out and IT installation. Featuring Office 365 hosted email to replace an aging Exchange server
            on-premises. Custom CMS using N2 CMS framework and .NET 3.5. Runs on Microsoft Azure.
          </p>
        </ImageAndText>
        <CTAs />
      </div>
    </Container>
  );
};

// Mount the component to the DOM
document.addEventListener('DOMContentLoaded', () => {
  const element = document.getElementById('projects-root');
  if (element) {
    ReactDOM.createRoot(element).render(
      <React.StrictMode>
        <ProjectsPage />
      </React.StrictMode>
    );
  }
});