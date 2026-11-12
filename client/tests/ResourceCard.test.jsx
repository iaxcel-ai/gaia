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

test('shows how long ago the value was updated', () => {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  render(<ResourceCard type="bed" quantity={5} stale={false} updatedAt={tenMinutesAgo} />);
  expect(screen.getByText('Updated 10 min ago')).toBeInTheDocument();
});

test('older updates are shown in hours and days', () => {
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  render(<ResourceCard type="bed" quantity={5} stale={true} updatedAt={threeHoursAgo} />);
  render(<ResourceCard type="supply" quantity={1} stale={true} updatedAt={twoDaysAgo} />);
  expect(screen.getByText('Updated 3 h ago')).toBeInTheDocument();
  expect(screen.getByText('Updated 2 days ago')).toBeInTheDocument();
});
