using Microsoft.EntityFrameworkCore;
using NeonEfExample.Models;

namespace NeonEfExample.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<Todo> Todos => Set<Todo>();
    }
}