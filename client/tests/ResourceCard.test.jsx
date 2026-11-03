import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import ResourceCard from '../src/components/ResourceCard';

test('renders the resource type and quantity', () => {
  render(<ResourceCard type="bed" quantity={5} stale={false} />);
  expect(screen.getByText(/bed/i)).toBeInTheDocument();
  expect(screen.getByText('5')).toBeInTheDocument();
  expect(screen.queryByText(/stale/i)).not.toBeInTheDocument();
});

test('shows a stale badge when stale is true', () => {
  render(<ResourceCard type="specialist" quantity={2} stale={true} />);
  expect(screen.getByText(/stale/i)).toBeInTheDocument();
});
