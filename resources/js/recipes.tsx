import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import Container from './components/container';
import MainTitle from './components/main-title';
import { ModalImage } from './components/modal-image';
import { CTAs } from './components/ctas';
import { RecipeDisplayItem } from './components/recipe-display-item';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from './components/ui/breadcrumb';

interface Recipe {
    slug: string;
    title: string;
    categories: string[];
    images: string[];
}

interface RecipesIndexProps {
    initialRecipes: Recipe[];
    initialCategories: string[];
}

interface RecipeDisplayItemProps {
    recipe: Recipe;
}

const RecipesIndex: React.FC<RecipesIndexProps> = ({ initialRecipes, initialCategories }) => {
    const [recipes] = useState<Recipe[]>(initialRecipes);
    const [categories] = useState<string[]>(initialCategories);
    const uniqueCategories = Array.from(new Set(initialCategories));
    const [selectedCategory, setSelectedCategory] = useState<string>('');

    const filteredRecipes = selectedCategory
        ? recipes.filter((recipe) => recipe.categories.includes(selectedCategory))
        : recipes;

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6">Recipes</h1>

            <div className="mb-4 flex flex-wrap gap-2">
                <Button
                    variant={!selectedCategory ? "default" : "secondary"}
                    onClick={() => setSelectedCategory('')}
                >
                    All
                </Button>
                {uniqueCategories.map((category) => (
                    <Button
                        key={category}
                        variant={selectedCategory === category ? "default" : "secondary"}
                        onClick={() => setSelectedCategory(category)}
                    >
                        {category}
                    </Button>
                ))}
            </div>

            <ul className="list-none p-0 space-y-2">
                {filteredRecipes.map((recipe) => (
                    <RecipeDisplayItem key={recipe.slug} recipe={recipe} />
                ))}
            </ul>
        </div>
    );
};

interface RecipeShowProps {
    data: any;
    content: string;
    relatedRecipes: Recipe[];
    slug: string;
}

const RecipeShow: React.FC<RecipeShowProps> = ({ data, content, relatedRecipes, slug }) => {
    return (
        <Container>
            <div className="py-4">
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/">Home</BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/recipes">Recipes</BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>{data.title}</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </div>
            <div className="max-w-2xl mx-auto py-8">
                <MainTitle>{data.title}</MainTitle>
                <div className="flex flex-col md:flex-row">
                    <div className="md:w-1/3 p-2">
                        <h2 className="text-2xl font-bold mb-4">Ingredients</h2>
                        <ul className="list-disc pl-5 space-y-2">
                            {data.ingredients.map((x: string, i: number) => (
                                <li key={i}>{x}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="md:w-2/3 p-2">
                        <h2 className="text-2xl font-bold mb-4">Instructions</h2>
                        <ReactMarkdown>{content}</ReactMarkdown>
                        {data.images && data.images.length > 0 && (
                            <div className="mt-4">
                                <ModalImage title={data.title} imageUrl={'/images/recipe/' + data.images[0]} alt={data.title} />
                            </div>
                        )}
                    </div>
                </div>

                {relatedRecipes.length > 0 && data.categories && data.categories.length > 0 && (
                    <div className="mt-8">
                        <h2 className="text-2xl font-bold mb-4">Other recipes in {data.categories[0]}</h2>
                        <ul className="list-disc pl-5 space-y-2">
                            {relatedRecipes.map((recipe) => (
                                <RecipeDisplayItem key={recipe.slug} recipe={recipe} />
                            ))}
                        </ul>
                    </div>
                )}

                <CTAs />
            </div>
        </Container>
    );
};

// Mount the component to the DOM
document.addEventListener('DOMContentLoaded', () => {
    const element = document.getElementById('recipes-root');
    if (element) {
        const initialRecipes = JSON.parse(element.dataset.recipes || '[]');
        const initialCategories = JSON.parse(element.dataset.categories || '[]');

        ReactDOM.createRoot(element).render(
            <React.StrictMode>
                <RecipesIndex initialRecipes={initialRecipes} initialCategories={initialCategories} />
            </React.StrictMode>
        );
    }

    const showElement = document.getElementById('recipe-show-root');
    if (showElement) {
        const data = JSON.parse(showElement.dataset.data || '{}');
        const content = showElement.dataset.content || '';
        const relatedRecipes = JSON.parse(showElement.dataset.relatedRecipes || '[]');
        const slug = showElement.dataset.slug || '';

        ReactDOM.createRoot(showElement).render(
            <React.StrictMode>
                <RecipeShow data={data} content={content} relatedRecipes={relatedRecipes} slug={slug} />
            </React.StrictMode>
        );
    }
});