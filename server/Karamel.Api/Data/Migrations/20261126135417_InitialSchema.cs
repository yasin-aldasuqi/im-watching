using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Karamel.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "devices",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    secret_hash = table.Column<byte[]>(type: "bytea", nullable: false),
                    push_endpoint = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    p256dh = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    auth = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_devices", x => x.id);
                    table.CheckConstraint("ck_devices_secret_hash_sha256", "octet_length(secret_hash) = 32");
                });

            migrationBuilder.CreateTable(
                name: "reminder_schedules",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    device_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reminder_key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    next_fire_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    interval_seconds = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_reminder_schedules", x => x.id);
                    table.CheckConstraint("ck_reminder_schedules_interval_positive", "interval_seconds IS NULL OR interval_seconds > 0");
                    table.ForeignKey(
                        name: "fk_reminder_schedules_devices_device_id",
                        column: x => x.device_id,
                        principalTable: "devices",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_devices_push_endpoint",
                table: "devices",
                column: "push_endpoint",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_reminder_schedules_device_id_reminder_key",
                table: "reminder_schedules",
                columns: new[] { "device_id", "reminder_key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_reminder_schedules_next_fire_at",
                table: "reminder_schedules",
                column: "next_fire_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "reminder_schedules");

            migrationBuilder.DropTable(
                name: "devices");
        }
    }
}
